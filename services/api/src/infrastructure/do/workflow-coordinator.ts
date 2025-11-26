/** WorkflowCoordinator Durable Object - owns workflow run state and coordinates execution */

import type { Logger } from '@wonder/logger';
import { CustomTypeRegistry, DDLGenerator, DMLGenerator, type SchemaType } from '@wonder/schema';
import { ulid } from 'ulid';
import type { Context, EventKind, Token } from '~/domains/execution/definitions';
import type { WorkflowTask, WorkflowTaskResult } from '../queue/types';

/**
 * WorkflowCoordinator is a Durable Object that owns the execution state for a single workflow run.
 *
 * Responsibilities:
 * - Store context in SQLite (input, state, output mapped to columns/tables)
 * - Track active tokens and their state
 * - Enqueue tasks to Queue for Worker execution
 * - Receive task results and update context
 * - Emit events for observability
 * - Coordinate fan-in synchronization (future)
 */
export class WorkflowCoordinator implements DurableObject {
  private sql: SqlStorage;
  private logger: Logger;
  private ddlGenerator?: DDLGenerator;
  private dmlGenerator?: DMLGenerator;
  private customTypes: CustomTypeRegistry;
  private sequenceNumber: number = 0;

  constructor(private state: DurableObjectState, private env: Env) {
    this.sql = this.state.storage.sql;

    // Initialize custom type registry
    this.customTypes = new CustomTypeRegistry();
    this.customTypes.register('artifact_ref', {
      validate: (value: unknown): boolean => {
        return typeof value === 'string' && value.length > 0;
      },
      description: 'Reference to an artifact (string ID)',
    });

    // For Stage 0: simple console logging since DO doesn't have D1 binding for logger
    this.logger = {
      info: (event_type: string, metadata?: Record<string, unknown>) => {
        console.log('[INFO]', event_type, metadata);
      },
      error: (event_type: string, metadata?: Record<string, unknown>) => {
        console.error('[ERROR]', event_type, metadata);
      },
      warn: (event_type: string, metadata?: Record<string, unknown>) => {
        console.warn('[WARN]', event_type, metadata);
      },
      debug: (event_type: string, metadata?: Record<string, unknown>) => {
        console.debug('[DEBUG]', event_type, metadata);
      },
      fatal: (event_type: string, metadata?: Record<string, unknown>) => {
        console.error('[FATAL]', event_type, metadata);
      },
      child: (metadata: Record<string, unknown>) => {
        return {
          info: (event_type: string, meta?: Record<string, unknown>) => {
            console.log('[INFO]', event_type, { ...metadata, ...meta });
          },
          error: (event_type: string, meta?: Record<string, unknown>) => {
            console.error('[ERROR]', event_type, { ...metadata, ...meta });
          },
          warn: (event_type: string, meta?: Record<string, unknown>) => {
            console.warn('[WARN]', event_type, { ...metadata, ...meta });
          },
          debug: (event_type: string, meta?: Record<string, unknown>) => {
            console.debug('[DEBUG]', event_type, { ...metadata, ...meta });
          },
          fatal: (event_type: string, meta?: Record<string, unknown>) => {
            console.error('[FATAL]', event_type, { ...metadata, ...meta });
          },
          child: () => {
            throw new Error('Nested child logger not implemented');
          },
          flush: async () => {},
        };
      },
      flush: async () => {},
    } as Logger;
  }

  /**
   * Initialize and execute a workflow run.
   * Called by the trigger service after creating the run in D1.
   */
  async executeWorkflow(params: {
    workflowRunId: string;
    workflowDefId: string;
    workflowVersion: number;
    initialNodeId: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    context: Context;
  }): Promise<void> {
    const { workflowRunId, initialNodeId, inputSchema, outputSchema, context } = params;

    this.logger.info('workflow_coordinator_started', {
      workflow_run_id: workflowRunId,
      durable_object_id: this.state.id.toString(),
    });

    try {
      // Create schema for context storage (Stage 0: simplified with JSON for state)
      const contextSchemaType: SchemaType = {
        type: 'object',
        properties: {
          input: inputSchema as SchemaType,
          state: { type: 'object' }, // Simplified: store as JSON
          output: outputSchema as SchemaType,
        },
        required: ['input'],
      };

      // Initialize DDL and DML generators
      this.ddlGenerator = new DDLGenerator(contextSchemaType, this.customTypes, {
        nestedObjectStrategy: 'json', // For Stage 0, use JSON for nested objects
        arrayStrategy: 'json', // For Stage 0, use JSON for arrays
      });

      this.dmlGenerator = new DMLGenerator(contextSchemaType, this.customTypes, {
        nestedObjectStrategy: 'json',
        arrayStrategy: 'json',
      });

      // Generate and create context storage table
      const contextDDL = this.ddlGenerator.generateDDL('context');
      this.sql.exec(contextDDL).toArray();

      // Create tokens table
      this.sql
        .exec(
          `
        CREATE TABLE IF NOT EXISTS tokens (
          id TEXT PRIMARY KEY,
          node_id TEXT NOT NULL,
          status TEXT NOT NULL,
          path_id TEXT NOT NULL,
          parent_token_id TEXT,
          fan_out_node_id TEXT,
          branch_index INTEGER NOT NULL,
          branch_total INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
        )
        .toArray();

      // Create events table (buffered until batch flush to D1)
      this.sql
        .exec(
          `
        CREATE TABLE IF NOT EXISTS events (
          sequence_number INTEGER PRIMARY KEY,
          kind TEXT NOT NULL,
          payload TEXT NOT NULL,
          timestamp TEXT NOT NULL
        )
      `,
        )
        .toArray();

      // Store initial context using DML generator
      const { statements, values } = this.dmlGenerator.generateInsert('context', context);
      for (let i = 0; i < statements.length; i++) {
        this.sql.exec(statements[i], ...values[i]).toArray();
      }

      // Create initial token
      const initialToken: Token = {
        id: ulid(),
        workflow_run_id: workflowRunId,
        node_id: initialNodeId,
        status: 'active',
        path_id: workflowRunId,
        parent_token_id: null,
        fan_out_node_id: null,
        branch_index: 0,
        branch_total: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.sql
        .exec(
          `INSERT INTO tokens (id, node_id, status, path_id, parent_token_id, fan_out_node_id, branch_index, branch_total, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          initialToken.id,
          initialToken.node_id,
          initialToken.status,
          initialToken.path_id,
          initialToken.parent_token_id,
          initialToken.fan_out_node_id,
          initialToken.branch_index,
          initialToken.branch_total,
          initialToken.created_at,
          initialToken.updated_at,
        )
        .toArray();

      // Emit workflow_started event
      await this.emitEvent('workflow_started', {
        workflow_run_id: workflowRunId,
        workflow_def_id: params.workflowDefId,
        workflow_version: params.workflowVersion,
        input: context.input,
      });

      this.logger.info('workflow_coordinator_initialized', {
        workflow_run_id: workflowRunId,
        initial_token_id: initialToken.id,
        initial_node_id: initialNodeId,
      });

      // Store metadata for this run
      await this.state.storage.put('workflow_run_id', workflowRunId);
      await this.state.storage.put('workflow_def_id', params.workflowDefId);

      // For Stage 0: immediately enqueue initial token
      // In future stages, this would be part of a more complex token advancement loop
      await this.enqueueTokenTask(initialToken);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error('workflow_coordinator_initialization_failed', {
        workflow_run_id: workflowRunId,
        error: errorMessage,
      });
      throw err;
    }
  }

  /**
   * Enqueue a task for a token to be executed by a Worker.
   * The Worker will process the task and call receiveTaskResult with the result.
   */
  private async enqueueTokenTask(token: Token): Promise<void> {
    const workflowRunId = await this.state.storage.get<string>('workflow_run_id');
    if (!workflowRunId) {
      throw new Error('Workflow run ID not found in DO storage');
    }

    // For Stage 0: we need to fetch node and action details
    // In a real implementation, these would be cached in DO state or passed in
    // For now, we'll use a simplified approach with a fetch to the worker

    const taskId = ulid();

    // Emit node_started event
    await this.emitEvent('node_started', {
      token_id: token.id,
      node_id: token.node_id,
    });

    const task: WorkflowTask = {
      task_id: taskId,
      workflow_run_id: workflowRunId,
      token_id: token.id,
      node_id: token.node_id,
      action_id: '', // Will be filled by worker from node lookup
      action_kind: 'llm_call', // Simplified for Stage 0
      action_implementation: {}, // Will be filled by worker
      input_data: {}, // For Stage 0, worker will read from context
      durable_object_id: this.state.id.toString(),
      enqueued_at: new Date().toISOString(),
    };

    this.logger.info('task_enqueued', {
      workflow_run_id: workflowRunId,
      task_id: taskId,
      token_id: token.id,
      node_id: token.node_id,
    });

    // Send to queue
    await this.env.WORKFLOW_QUEUE.send(task);
  }

  /**
   * Receive a task result from a Worker after execution.
   * Update context, advance token, emit events.
   */
  async receiveTaskResult(result: WorkflowTaskResult): Promise<void> {
    const workflowRunId = await this.state.storage.get<string>('workflow_run_id');

    this.logger.info('task_result_received', {
      workflow_run_id: workflowRunId,
      task_id: result.task_id,
      token_id: result.token_id,
      status: result.status,
    });

    try {
      if (result.status === 'failure') {
        // Handle failure - for Stage 0, just log and fail the workflow
        this.logger.error('task_execution_failed', {
          workflow_run_id: workflowRunId,
          task_id: result.task_id,
          token_id: result.token_id,
          error: result.error,
        });

        await this.emitEvent('node_failed', {
          token_id: result.token_id,
          error: result.error,
        });

        // For Stage 0, we'll just stop here
        // In future: emit workflow_failed, update run status in D1
        return;
      }

      // Success: update context with output data
      if (result.output_data && this.dmlGenerator) {
        // Read current context
        const contextRow = this.sql.exec('SELECT * FROM context LIMIT 1').toArray();
        const currentContext = this.parseContextFromRow(contextRow[0]);

        // Merge output into state (Stage 0: simple merge)
        currentContext.state = {
          ...currentContext.state,
          ...result.output_data,
        };

        // Update context in SQLite using DML generator
        const { statements, values } = this.dmlGenerator.generateUpdate(
          'context',
          currentContext,
          '1=1', // Stage 0: single row table
        );
        for (let i = 0; i < statements.length; i++) {
          this.sql.exec(statements[i], ...values[i]).toArray();
        }
      }

      // Update token status to completed
      this.sql
        .exec(
          'UPDATE tokens SET status = ?, updated_at = ? WHERE id = ?',
          'completed',
          new Date().toISOString(),
          result.token_id,
        )
        .toArray();

      // Emit node_completed event
      await this.emitEvent('node_completed', {
        token_id: result.token_id,
        result: result.output_data,
      });

      // Check if this is a terminal node (Stage 0: single node, so yes)
      await this.completeWorkflow();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error('task_result_processing_failed', {
        workflow_run_id: workflowRunId,
        task_id: result.task_id,
        error: errorMessage,
      });
      throw err;
    }
  }

  /**
   * Complete the workflow: set output, emit event, flush to D1.
   */
  private async completeWorkflow(): Promise<void> {
    const workflowRunId = await this.state.storage.get<string>('workflow_run_id');

    if (!this.dmlGenerator) {
      throw new Error('DML generator not initialized');
    }

    // Read final context
    const contextRow = this.sql.exec('SELECT * FROM context LIMIT 1').toArray();
    const finalContext = this.parseContextFromRow(contextRow[0]);

    // For Stage 0: output = state
    finalContext.output = { ...finalContext.state };

    // Update context with output using DML generator
    const { statements, values } = this.dmlGenerator.generateUpdate(
      'context',
      finalContext,
      '1=1', // Stage 0: single row table
    );
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }

    // Emit workflow_completed event
    await this.emitEvent('workflow_completed', {
      workflow_run_id: workflowRunId,
      output: finalContext.output,
    });

    this.logger.info('workflow_completed', {
      workflow_run_id: workflowRunId,
      output: finalContext.output,
    });

    // Flush events to D1 (via fetch to worker endpoint)
    await this.flushEvents();

    // Update run status in D1 (via fetch to worker endpoint)
    await this.updateRunInD1(finalContext);
  }

  /**
   * Emit an event (stored locally in DO SQLite, flushed to D1 in batches).
   */
  private async emitEvent(kind: EventKind, payload: Record<string, unknown>): Promise<void> {
    this.sequenceNumber++;

    this.sql
      .exec(
        'INSERT INTO events (sequence_number, kind, payload, timestamp) VALUES (?, ?, ?, ?)',
        this.sequenceNumber,
        kind,
        JSON.stringify(payload),
        new Date().toISOString(),
      )
      .toArray();
  }

  /**
   * Flush buffered events to D1 (called at workflow completion for Stage 0).
   */
  private async flushEvents(): Promise<void> {
    const workflowRunId = await this.state.storage.get<string>('workflow_run_id');
    const eventsRows = this.sql.exec('SELECT * FROM events ORDER BY sequence_number').toArray();

    const events = eventsRows.map((row) => ({
      workflow_run_id: workflowRunId!,
      sequence_number: row.sequence_number as number,
      kind: row.kind as EventKind,
      payload: row.payload as string, // Already JSON string
      timestamp: row.timestamp as string,
      archived_at: null,
    }));

    // Send to worker for D1 persistence (via internal fetch)
    // For Stage 0, we'll use a simple approach
    this.logger.info('flushing_events_to_d1', {
      workflow_run_id: workflowRunId,
      event_count: events.length,
    });

    // Store for worker to pick up
    await this.state.storage.put('pending_events', events);
  }

  /**
   * Update workflow run in D1 with final context and status.
   */
  private async updateRunInD1(finalContext: Context): Promise<void> {
    const workflowRunId = await this.state.storage.get<string>('workflow_run_id');

    this.logger.info('updating_run_in_d1', {
      workflow_run_id: workflowRunId,
    });

    // Store for worker to pick up
    await this.state.storage.put('final_context', finalContext);
    await this.state.storage.put('final_status', 'completed');
  }

  /**
   * Fetch endpoint for DO communication.
   * Handles: /execute (start workflow), /task-result (worker results), /pending-data (get final data)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Start workflow execution
    if (url.pathname === '/execute' && request.method === 'POST') {
      const params = (await request.json()) as Parameters<typeof this.executeWorkflow>[0];
      await this.executeWorkflow(params);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Receive task result from worker
    if (url.pathname === '/task-result' && request.method === 'POST') {
      const result = (await request.json()) as WorkflowTaskResult;
      await this.receiveTaskResult(result);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get pending data for worker to persist to D1
    if (url.pathname === '/pending-data' && request.method === 'GET') {
      const pendingEvents = await this.state.storage.get('pending_events');
      const finalContext = await this.state.storage.get('final_context');
      const finalStatus = await this.state.storage.get('final_status');

      return new Response(
        JSON.stringify({
          events: pendingEvents || [],
          context: finalContext,
          status: finalStatus,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Parse context from SQLite row.
   * For Stage 0: assumes JSON columns for input/state/output.
   */
  private parseContextFromRow(row: Record<string, unknown>): Context {
    return {
      input: row.input ? JSON.parse(row.input as string) : {},
      state: row.state ? JSON.parse(row.state as string) : {},
      output: row.output ? JSON.parse(row.output as string) : undefined,
      artifacts: {},
    };
  }
}

/**
 * Environment bindings for WorkflowCoordinator.
 */
interface Env {
  WORKFLOW_QUEUE: Queue<WorkflowTask>;
  ENVIRONMENT?: string;
}
