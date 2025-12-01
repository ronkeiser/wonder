/** Workflow coordination via Durable Object */

import { createLogger, type Logger } from '@wonder/logger';
import { CustomTypeRegistry } from '@wonder/schema';
import { DurableObject } from 'cloudflare:workers';
import { EventBuffer } from '../events/buffer';
import { EventStreamer } from '../events/stream';
import type { Context, WorkflowTaskResult } from '../execution/definitions';
import { ContextManager } from './context';
import { WorkflowLifecycle } from './lifecycle';
import { TaskResultProcessor } from './results';
import { TaskDispatcher } from './tasks';
import { TokenManager } from './tokens';

export interface InitializeParams {
  workflowRunId: string;
  workflowDefId: string;
  workflowVersion: number;
  initialNodeId: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  context: Context;
}

/** Orchestrates workflow execution via specialized managers. */
export class WorkflowCoordinator extends DurableObject {
  private logger: Logger;
  private lifecycle: WorkflowLifecycle;
  private results: TaskResultProcessor;
  private streamer: EventStreamer;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
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

    // Initialize core managers
    const context = new ContextManager(this.ctx.storage.sql, customTypes);
    const tokens = new TokenManager(this.ctx.storage.sql, customTypes);
    const events = new EventBuffer(this.ctx.storage.sql, customTypes);
    const tasks = new TaskDispatcher(this.env.WORKFLOW_QUEUE, this.logger, events);
    this.streamer = new EventStreamer(this.ctx);

    // Set up event broadcasting to WebSocket clients
    events.setBroadcastCallback((kind, payload) => {
      this.streamer.broadcast(kind, payload);
    });

    // Initialize lifecycle and results processors
    this.lifecycle = new WorkflowLifecycle(this.logger, context, tokens, events, tasks);
    this.lifecycle.setDurableObjectId(this.ctx.id.toString());
    this.results = new TaskResultProcessor(this.logger, context, tokens, events, this.lifecycle);
  }

  /**
   * RPC Method: Initialize workflow run in DO storage.
   * Called directly via stub.initialize(params).
   */
  async initialize(params: InitializeParams): Promise<void> {
    this.logger.info('workflow_initialize_rpc', {
      workflow_run_id: params.workflowRunId,
      durable_object_id: this.ctx.id.toString(),
    });

    await this.lifecycle.initialize(params);
  }

  /**
   * RPC Method: Process task result from worker.
   * Called directly via stub.processTaskResult(result).
   */
  async processTaskResult(result: WorkflowTaskResult): Promise<void> {
    this.logger.info('process_task_result_rpc', {
      task_id: result.task_id,
      token_id: result.token_id,
      status: result.status,
      durable_object_id: this.ctx.id.toString(),
    });

    await this.results.process(result);
  }

  /**
   * RPC Method: Get pending events and context for D1 persistence.
   * Called directly via stub.getPendingData().
   */
  async getPendingData(): Promise<{ events: unknown[]; context: Context | null }> {
    this.logger.info('get_pending_data_rpc', {
      workflow_run_id: this.lifecycle.getWorkflowRunId(),
      durable_object_id: this.ctx.id.toString(),
    });

    return await this.lifecycle.getPendingData();
  }

  /**
   * HTTP Method: Handle WebSocket upgrade for event streaming.
   * This is the ONLY legitimate use of fetch() - actual HTTP protocol.
   */
  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');

    if (upgrade === 'websocket') {
      const workflowRunId = this.lifecycle.getWorkflowRunId();

      this.logger.info('websocket_upgrade', {
        workflow_run_id: workflowRunId,
        durable_object_id: this.ctx.id.toString(),
      });

      if (!workflowRunId) {
        return new Response('Workflow not initialized', { status: 400 });
      }

      return this.streamer.handleUpgrade(request, workflowRunId);
    }

    // Everything else should use RPC methods
    this.logger.warn('invalid_fetch_call', {
      method: request.method,
      url: request.url,
      durable_object_id: this.ctx.id.toString(),
    });

    return new Response('Use RPC methods for coordination', { status: 405 });
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
}
