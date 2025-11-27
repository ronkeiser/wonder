/** Workflow coordination via Durable Object */

import { createLogger, type Logger } from '@wonder/logger';
import { CustomTypeRegistry, type SchemaType } from '@wonder/schema';
import { ulid } from 'ulid';
import type { Context, Token, WorkflowTaskResult } from '../definitions';
import { ContextManager } from './context';
import { EventManager } from './events';
import { TaskDispatcher } from './tasks';
import { TokenManager } from './tokens';

/**
 * WorkflowCoordinator is a Durable Object that manages workflow execution state.
 * It handles context storage, token state, events, and task queueing.
 */
export class WorkflowCoordinator implements DurableObject {
  private logger: Logger;
  private context: ContextManager;
  private tokens: TokenManager;
  private events: EventManager;
  private tasks: TaskDispatcher;
  private workflowRunId?: string;
  private workflowDefId?: string;
  private durableObjectId?: string;

  constructor(private state: DurableObjectState, private env: Env) {
    // Initialize console-only logger (no D1 access in DO)
    this.logger = createLogger({ consoleOnly: true });

    // Initialize custom type registry
    const customTypes = new CustomTypeRegistry();
    customTypes.register('artifact_ref', {
      validate: (value: unknown): boolean => {
        return typeof value === 'string' && value.length > 0;
      },
      description: 'Reference to an artifact (string ID)',
    });

    // Initialize managers
    this.context = new ContextManager(this.state.storage.sql, customTypes);
    this.tokens = new TokenManager(this.state.storage.sql, customTypes);
    this.events = new EventManager(this.state.storage.sql, customTypes);
    this.tasks = new TaskDispatcher(this.env.WORKFLOW_QUEUE, this.logger, this.events);

    // Set up event broadcasting to WebSocket clients
    this.events.setBroadcastCallback((kind, payload) => {
      this.broadcastEvent(kind, payload);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    this.logger.info('coordinator_fetch', {
      pathname: url.pathname,
      upgrade: request.headers.get('Upgrade'),
      workflow_run_id: this.workflowRunId,
    });

    try {
      // WebSocket upgrade for event streaming
      if (url.pathname === '/stream' && request.headers.get('Upgrade') === 'websocket') {
        this.logger.info('handling_websocket_upgrade');
        return this.handleWebSocketUpgrade(request);
      }

      if (url.pathname === '/execute' && request.method === 'POST') {
        return await this.handleExecute(request);
      }

      if (url.pathname === '/task-result' && request.method === 'POST') {
        return await this.handleTaskResult(request);
      }

      if (url.pathname === '/pending-data' && request.method === 'GET') {
        return await this.handleGetPendingData();
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      this.logger.error('coordinator_request_failed', {
        path: url.pathname,
        error: err instanceof Error ? err.message : String(err),
      });
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  /**
   * Handle WebSocket upgrade for event streaming.
   */
  private handleWebSocketUpgrade(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Accept WebSocket connection
    this.state.acceptWebSocket(server);

    this.logger.info('websocket_connected', {
      workflow_run_id: this.workflowRunId,
      durable_object_id: this.durableObjectId,
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Broadcast event to all connected WebSocket clients.
   */
  private broadcastEvent(kind: string, payload: Record<string, unknown>): void {
    const sockets = this.state.getWebSockets();
    const message = JSON.stringify({
      kind,
      payload,
      timestamp: new Date().toISOString(),
    });

    for (const ws of sockets) {
      try {
        ws.send(message);
      } catch (err) {
        this.logger.error('websocket_send_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Initialize workflow run in DO storage.
   * Creates tables, stores initial context, creates initial token, enqueues first task.
   */
  private async handleExecute(request: Request): Promise<Response> {
    const params = (await request.json()) as {
      workflowRunId: string;
      workflowDefId: string;
      workflowVersion: number;
      initialNodeId: string;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
      context: Context;
    };

    const {
      workflowRunId,
      workflowDefId,
      workflowVersion,
      initialNodeId,
      inputSchema,
      outputSchema,
      context,
    } = params;

    this.workflowRunId = workflowRunId;
    this.workflowDefId = workflowDefId;
    this.durableObjectId = this.state.id.toString();

    this.logger.info('workflow_initialization_started', {
      workflow_run_id: workflowRunId,
      durable_object_id: this.durableObjectId,
    });

    // Initialize all managers and create tables
    this.context.initialize(
      workflowRunId,
      workflowDefId,
      inputSchema as SchemaType,
      outputSchema as SchemaType,
    );
    this.tokens.initialize();
    this.events.initialize();

    // Store initial context
    this.context.store(context);

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
    this.tokens.store(initialToken);

    // Emit workflow_started event
    this.events.emit('workflow_started', {
      workflow_run_id: workflowRunId,
      workflow_def_id: workflowDefId,
      workflow_version: workflowVersion,
      input: context.input,
    });

    this.logger.info('workflow_initialized', {
      workflow_run_id: workflowRunId,
      initial_token_id: initialToken.id,
    });

    // Enqueue initial token task
    if (!this.durableObjectId) {
      throw new Error('Durable object ID not set');
    }
    this.tasks.enqueue(initialToken, workflowRunId, this.durableObjectId, context);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Process task result from worker.
   * Updates context, updates token, emits events, checks for completion.
   */
  private async handleTaskResult(request: Request): Promise<Response> {
    if (!this.workflowRunId) {
      throw new Error('Workflow not initialized');
    }

    const result = (await request.json()) as WorkflowTaskResult;

    this.logger.info('processing_task_result', {
      workflow_run_id: this.workflowRunId,
      task_id: result.task_id,
      token_id: result.token_id,
      status: result.status,
    });

    if (result.status === 'failure') {
      this.handleTaskFailure(result);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update context with output data
    if (result.output_data) {
      const currentContext = this.context.get();
      currentContext.state = {
        ...currentContext.state,
        ...result.output_data,
      };
      this.context.update(currentContext);

      this.logger.info('context_updated_with_output', {
        workflow_run_id: this.workflowRunId,
        output_data: result.output_data,
      });
    }

    // Update token status
    this.tokens.updateStatus(result.token_id, 'completed');

    // Emit node_completed event
    this.events.emit('node_completed', {
      token_id: result.token_id,
      result: result.output_data,
    });

    // Check for workflow completion (Stage 0: single node, so always complete after first task)
    this.completeWorkflow();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Get pending events and final context for D1 persistence.
   */
  private async handleGetPendingData(): Promise<Response> {
    if (!this.workflowRunId) {
      return new Response(JSON.stringify({ events: [], context: null }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const events = this.events.getPending(this.workflowRunId);
    const finalContext = this.context.get();

    return new Response(JSON.stringify({ events, context: finalContext }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Complete the workflow.
   * Sets final output, emits completion event.
   */
  private completeWorkflow(): void {
    if (!this.workflowRunId) {
      throw new Error('Workflow not initialized');
    }

    const finalContext = this.context.get();

    // For Stage 0: output = state
    finalContext.output = { ...finalContext.state };

    this.context.update(finalContext);

    // Emit workflow_completed event
    this.events.emit('workflow_completed', {
      workflow_run_id: this.workflowRunId,
      output: finalContext.output,
    });

    this.logger.info('workflow_completed', {
      workflow_run_id: this.workflowRunId,
      output: finalContext.output,
      full_context: finalContext,
    });
  }

  /**
   * Handle WebSocket close events.
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    this.logger.info('websocket_close_handler', { code, reason, wasClean });
  }

  private handleTaskFailure(result: WorkflowTaskResult): void {
    this.logger.error('task_execution_failed', {
      workflow_run_id: this.workflowRunId,
      task_id: result.task_id,
      token_id: result.token_id,
      error: result.error,
    });

    this.events.emit('node_failed', {
      token_id: result.token_id,
      error: result.error,
    });

    // For Stage 0, workflow fails on any task failure
    this.events.emit('workflow_failed', {
      workflow_run_id: this.workflowRunId,
      error: result.error,
    });
  }
}
