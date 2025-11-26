/** Workflow execution service - orchestrates workflow runs and coordination */

import type { Logger } from '@wonder/logger';
import {
  CustomTypeRegistry,
  DDLGenerator,
  DMLGenerator,
  Validator,
  type SchemaType,
  type ValidationResult,
} from '@wonder/schema';
import { ulid } from 'ulid';
import { NotFoundError, ValidationError } from '~/errors';
import type { ServiceContext } from '~/infrastructure/context';
import type { WorkflowTask, WorkflowTaskResult } from '~/infrastructure/queue/types';
import * as graphRepo from '../graph/repository';
import {
  eventSchemaType,
  tokenSchemaType,
  type Context,
  type EventKind,
  type Token,
  type WorkflowRun,
} from './definitions';
import * as execRepo from './repository';

/** Custom type registry for schema validation */

const customTypes = new CustomTypeRegistry();

// Register artifact_ref custom type (validates string format)
customTypes.register('artifact_ref', {
  validate: (value: unknown): boolean => {
    return typeof value === 'string' && value.length > 0;
  },
  description: 'Reference to an artifact (string ID)',
});

/**
 * Service context extended with DO namespace binding.
 */
export interface ExecutionServiceContext extends ServiceContext {
  WORKFLOW_COORDINATOR: DurableObjectNamespace;
}

/**
 * Trigger a workflow execution.
 * Creates a run in D1, gets a DO instance, and invokes DO.executeWorkflow().
 * Returns immediately - execution continues asynchronously in DO → Queue → Worker → DO.
 */
export async function triggerWorkflow(
  ctx: ExecutionServiceContext,
  workflowId: string,
  input: Record<string, unknown>,
): Promise<WorkflowRun> {
  ctx.logger.info('workflow_trigger_started', { workflow_id: workflowId });

  // Load workflow and definition
  const workflow = await graphRepo.getWorkflow(ctx.db, workflowId);
  if (!workflow) {
    ctx.logger.error('workflow_not_found', { workflow_id: workflowId });
    throw new NotFoundError(`Workflow not found: ${workflowId}`, 'workflow', workflowId);
  }

  const workflowDef = await graphRepo.getWorkflowDef(
    ctx.db,
    workflow.workflow_def_id,
    workflow.pinned_version ?? undefined,
  );
  if (!workflowDef) {
    ctx.logger.error('workflow_definition_not_found', {
      workflow_id: workflowId,
      workflow_def_id: workflow.workflow_def_id,
      version: workflow.pinned_version,
    });
    throw new NotFoundError(
      `Workflow definition not found: ${workflow.workflow_def_id}${
        workflow.pinned_version ? ` v${workflow.pinned_version}` : ''
      }`,
      'workflow_definition',
      workflow.workflow_def_id,
    );
  }

  // Validate input against schema
  const inputSchema = workflowDef.input_schema as SchemaType;
  const validator = new Validator(inputSchema, customTypes);
  const validationResult: ValidationResult = validator.validate(input);

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map((e: { path: string; message: string }) => `${e.path}: ${e.message}`)
      .join('; ');
    ctx.logger.error('workflow_validation_failed', {
      workflow_id: workflowId,
      workflow_def_id: workflowDef.id,
      errors: validationResult.errors,
    });
    throw new ValidationError(
      `Invalid input: ${errorMessages}`,
      'input',
      'SCHEMA_VALIDATION_FAILED',
    );
  }

  // Initialize context
  const context: Context = {
    input,
    state: {},
    artifacts: {},
  };

  // Create a unique DO ID for this workflow run
  const doId = ctx.WORKFLOW_COORDINATOR.newUniqueId();
  const durableObjectId = doId.toString();

  // Create workflow run in D1
  const workflowRun = await execRepo.createWorkflowRun(ctx.db, {
    project_id: workflow.project_id,
    workflow_id: workflow.id,
    workflow_def_id: workflowDef.id,
    workflow_version: workflowDef.version,
    status: 'running',
    context: JSON.stringify(context),
    active_tokens: JSON.stringify([]),
    durable_object_id: durableObjectId,
    parent_run_id: null,
    parent_node_id: null,
  });

  ctx.logger.info('workflow_run_created', {
    workflow_run_id: workflowRun.id,
    durable_object_id: durableObjectId,
  });

  // Get DO stub and invoke executeWorkflow
  const doStub = ctx.WORKFLOW_COORDINATOR.get(doId);

  try {
    // Invoke DO asynchronously (fire and forget for Stage 0)
    // In production, we'd want to wait for acknowledgment or use waitUntil
    doStub
      .fetch('https://do/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowRunId: workflowRun.id,
          workflowDefId: workflowDef.id,
          workflowVersion: workflowDef.version,
          initialNodeId: workflowDef.initial_node_id,
          inputSchema: workflowDef.input_schema,
          outputSchema: workflowDef.output_schema,
          context,
        }),
      })
      .catch((err) => {
        ctx.logger.error('do_invocation_failed', {
          workflow_run_id: workflowRun.id,
          durable_object_id: durableObjectId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    ctx.logger.info('workflow_trigger_completed', {
      workflow_id: workflowId,
      workflow_run_id: workflowRun.id,
      durable_object_id: durableObjectId,
    });

    // Return the workflow run immediately
    // Execution continues asynchronously in DO
    return workflowRun;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger.error('workflow_trigger_failed', {
      workflow_id: workflowId,
      workflow_run_id: workflowRun.id,
      error: errorMessage,
    });
    throw err;
  }
}

/**
 * WorkflowCoordinationService handles all workflow coordination logic.
 * Manages context storage, token state, events, and task queueing.
 * Protocol-agnostic - works with any storage backend (SqlStorage for DO).
 */
export class WorkflowCoordinationService {
  private logger: Logger;
  private sql: SqlStorage;
  private queue: Queue<WorkflowTask>;
  private customTypes: CustomTypeRegistry;
  private contextDDL?: DDLGenerator;
  private contextDML?: DMLGenerator;
  private tokenDDL: DDLGenerator;
  private tokenDML: DMLGenerator;
  private eventDDL: DDLGenerator;
  private eventDML: DMLGenerator;
  private sequenceNumber: number = 0;
  private workflowRunId?: string;
  private workflowDefId?: string;
  private durableObjectId?: string;

  constructor(sql: SqlStorage, queue: Queue<WorkflowTask>, logger: Logger) {
    this.sql = sql;
    this.queue = queue;
    this.logger = logger;

    // Initialize custom type registry
    this.customTypes = new CustomTypeRegistry();
    this.customTypes.register('artifact_ref', {
      validate: (value: unknown): boolean => {
        return typeof value === 'string' && value.length > 0;
      },
      description: 'Reference to an artifact (string ID)',
    });

    // Initialize DDL/DML generators for tokens and events
    this.tokenDDL = new DDLGenerator(tokenSchemaType, this.customTypes);
    this.tokenDML = new DMLGenerator(tokenSchemaType, this.customTypes);
    this.eventDDL = new DDLGenerator(eventSchemaType, this.customTypes);
    this.eventDML = new DMLGenerator(eventSchemaType, this.customTypes);
  }

  /**
   * Initialize workflow run in DO storage.
   * Creates tables, stores initial context, creates initial token, enqueues first task.
   */
  initializeWorkflow(params: {
    workflowRunId: string;
    workflowDefId: string;
    workflowVersion: number;
    initialNodeId: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    context: Context;
    durableObjectId: string;
  }): void {
    const {
      workflowRunId,
      workflowDefId,
      initialNodeId,
      inputSchema,
      outputSchema,
      context,
      durableObjectId,
    } = params;

    this.workflowRunId = workflowRunId;
    this.workflowDefId = workflowDefId;
    this.durableObjectId = durableObjectId;

    this.logger.info('workflow_initialization_started', {
      workflow_run_id: workflowRunId,
      durable_object_id: durableObjectId,
    });

    // Create context schema (Stage 0: simplified with JSON for state)
    const contextSchemaType: SchemaType = {
      type: 'object',
      properties: {
        workflow_run_id: { type: 'string' },
        workflow_def_id: { type: 'string' },
        input: inputSchema as SchemaType,
        state: { type: 'object' }, // Simplified: store as JSON
        output: outputSchema as SchemaType,
      },
      required: ['workflow_run_id', 'workflow_def_id', 'input'],
    };

    // Initialize context DDL/DML generators
    this.contextDDL = new DDLGenerator(contextSchemaType, this.customTypes, {
      nestedObjectStrategy: 'json',
      arrayStrategy: 'json',
    });

    this.contextDML = new DMLGenerator(contextSchemaType, this.customTypes, {
      nestedObjectStrategy: 'json',
      arrayStrategy: 'json',
    });

    // Create all tables
    this.createTables();

    // Store initial context
    const contextWithMeta = {
      workflow_run_id: workflowRunId,
      workflow_def_id: workflowDefId,
      ...context,
    };
    this.storeContext(contextWithMeta);

    // Create and store initial token
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
    this.storeToken(initialToken);

    // Emit workflow_started event
    this.emitEvent('workflow_started', {
      workflow_run_id: workflowRunId,
      workflow_def_id: params.workflowDefId,
      workflow_version: params.workflowVersion,
      input: context.input,
    });

    this.logger.info('workflow_initialized', {
      workflow_run_id: workflowRunId,
      initial_token_id: initialToken.id,
    });

    // Enqueue initial token task
    this.enqueueTask(initialToken);
  }

  /**
   * Process task result from worker.
   * Updates context, updates token, emits events, checks for completion.
   */
  processTaskResult(result: WorkflowTaskResult): void {
    if (!this.workflowRunId) {
      throw new Error('Workflow not initialized');
    }

    this.logger.info('processing_task_result', {
      workflow_run_id: this.workflowRunId,
      task_id: result.task_id,
      token_id: result.token_id,
      status: result.status,
    });

    if (result.status === 'failure') {
      this.handleTaskFailure(result);
      return;
    }

    // Update context with output data
    if (result.output_data) {
      const currentContext = this.getContext();
      currentContext.state = {
        ...currentContext.state,
        ...result.output_data,
      };
      this.updateContext(currentContext);
    }

    // Update token status
    this.updateTokenStatus(result.token_id, 'completed');

    // Emit node_completed event
    this.emitEvent('node_completed', {
      token_id: result.token_id,
      result: result.output_data,
    });

    // Check for workflow completion (Stage 0: single node, so always complete after first task)
    this.completeWorkflow();
  }

  /**
   * Complete the workflow.
   * Sets final output, emits completion event.
   */
  private completeWorkflow(): void {
    if (!this.workflowRunId) {
      throw new Error('Workflow not initialized');
    }

    if (!this.contextDML) {
      throw new Error('Context DML generator not initialized');
    }

    const finalContext = this.getContext();

    // For Stage 0: output = state
    finalContext.output = { ...finalContext.state };

    this.updateContext(finalContext);

    // Emit workflow_completed event
    this.emitEvent('workflow_completed', {
      workflow_run_id: this.workflowRunId,
      output: finalContext.output,
    });

    this.logger.info('workflow_completed', {
      workflow_run_id: this.workflowRunId,
      output: finalContext.output,
    });
  }

  /**
   * Get all pending events for batch flush to D1.
   */
  getPendingEvents(): Array<{
    workflow_run_id: string;
    sequence_number: number;
    kind: EventKind;
    payload: string;
    timestamp: string;
  }> {
    if (!this.workflowRunId) {
      return [];
    }

    const eventsRows = this.sql.exec('SELECT * FROM events ORDER BY sequence_number').toArray();

    return eventsRows.map((row) => ({
      workflow_run_id: this.workflowRunId!,
      sequence_number: row.sequence_number as number,
      kind: row.kind as EventKind,
      payload: row.payload as string,
      timestamp: row.timestamp as string,
    }));
  }

  /**
   * Get final context for D1 persistence.
   */
  getFinalContext(): Context {
    return this.getContext();
  }

  /**
   * Get workflow run ID.
   */
  getWorkflowRunId(): string | undefined {
    return this.workflowRunId;
  }

  // Private helpers

  private createTables(): void {
    // Create context table
    if (!this.contextDDL) {
      throw new Error('Context DDL generator not initialized');
    }
    const contextDDL = this.contextDDL.generateDDL('context');
    this.sql.exec(contextDDL).toArray();

    // Create tokens table
    const tokenDDL = this.tokenDDL.generateDDL('tokens');
    this.sql.exec(tokenDDL).toArray();

    // Create events table
    const eventDDL = this.eventDDL.generateDDL('events');
    this.sql.exec(eventDDL).toArray();
  }

  private storeContext(context: Record<string, unknown>): void {
    if (!this.contextDML) {
      throw new Error('Context DML generator not initialized');
    }

    const { statements, values } = this.contextDML.generateInsert('context', context);
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  private getContext(): Context {
    const contextRow = this.sql.exec('SELECT * FROM context LIMIT 1').toArray();
    if (contextRow.length === 0) {
      throw new Error('Context not found');
    }

    const row = contextRow[0];
    return {
      input: row.input ? JSON.parse(row.input as string) : {},
      state: row.state ? JSON.parse(row.state as string) : {},
      output: row.output ? JSON.parse(row.output as string) : undefined,
      artifacts: {},
    };
  }

  private updateContext(context: Context): void {
    if (!this.contextDML) {
      throw new Error('Context DML generator not initialized');
    }

    const contextWithMeta = {
      workflow_run_id: this.workflowRunId,
      workflow_def_id: this.workflowDefId,
      ...context,
    };

    const { statements, values } = this.contextDML.generateUpdate(
      'context',
      contextWithMeta,
      '1=1', // Stage 0: single row table
    );
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  private storeToken(token: Token): void {
    const { statements, values } = this.tokenDML.generateInsert('tokens', token);
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  private updateTokenStatus(tokenId: string, status: Token['status']): void {
    const { statements, values } = this.tokenDML.generateUpdate(
      'tokens',
      { status, updated_at: new Date().toISOString() },
      `id = '${tokenId}'`,
    );
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  private emitEvent(kind: EventKind, payload: Record<string, unknown>): void {
    this.sequenceNumber++;

    const event = {
      sequence_number: this.sequenceNumber,
      kind,
      payload: JSON.stringify(payload),
      timestamp: new Date().toISOString(),
    };

    const { statements, values } = this.eventDML.generateInsert('events', event);
    for (let i = 0; i < statements.length; i++) {
      this.sql.exec(statements[i], ...values[i]).toArray();
    }
  }

  private enqueueTask(token: Token): void {
    if (!this.workflowRunId || !this.durableObjectId) {
      throw new Error('Workflow not initialized');
    }

    const taskId = ulid();

    // Emit node_started event
    this.emitEvent('node_started', {
      token_id: token.id,
      node_id: token.node_id,
    });

    const task: WorkflowTask = {
      task_id: taskId,
      workflow_run_id: this.workflowRunId,
      token_id: token.id,
      node_id: token.node_id,
      action_id: '', // Will be filled by worker from node lookup
      action_kind: 'llm_call', // Simplified for Stage 0
      action_implementation: {}, // Will be filled by worker
      input_data: {}, // For Stage 0, worker will read from context
      durable_object_id: this.durableObjectId,
      enqueued_at: new Date().toISOString(),
    };

    this.logger.info('task_enqueued', {
      workflow_run_id: this.workflowRunId,
      task_id: taskId,
      token_id: token.id,
      node_id: token.node_id,
    });

    // Send to queue
    this.queue.send(task);
  }

  private handleTaskFailure(result: WorkflowTaskResult): void {
    this.logger.error('task_execution_failed', {
      workflow_run_id: this.workflowRunId,
      task_id: result.task_id,
      token_id: result.token_id,
      error: result.error,
    });

    this.emitEvent('node_failed', {
      token_id: result.token_id,
      error: result.error,
    });

    // For Stage 0, workflow fails on any task failure
    this.emitEvent('workflow_failed', {
      workflow_run_id: this.workflowRunId,
      error: result.error,
    });
  }
}
