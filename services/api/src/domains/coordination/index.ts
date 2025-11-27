/** Workflow coordination via Durable Object */

import { createLogger, type Logger } from '@wonder/logger';
import { CustomTypeRegistry } from '@wonder/schema';
import { EventBuffer } from '../events/buffer';
import { EventStreamer } from '../events/stream';
import { ContextManager } from './context';
import { WorkflowLifecycle } from './lifecycle';
import { TaskResultProcessor } from './results';
import { RequestRouter } from './router';
import { TaskDispatcher } from './tasks';
import { TokenManager } from './tokens';

/** Orchestrates workflow execution via specialized managers. */
export class WorkflowCoordinator implements DurableObject {
  private logger: Logger;
  private router: RequestRouter;
  private lifecycle: WorkflowLifecycle;
  private results: TaskResultProcessor;
  private streamer: EventStreamer;

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

    // Initialize core managers
    const context = new ContextManager(this.state.storage.sql, customTypes);
    const tokens = new TokenManager(this.state.storage.sql, customTypes);
    const events = new EventBuffer(this.state.storage.sql, customTypes);
    const tasks = new TaskDispatcher(this.env.WORKFLOW_QUEUE, this.logger, events);
    this.streamer = new EventStreamer(this.state);

    // Set up event broadcasting to WebSocket clients
    events.setBroadcastCallback((kind, payload) => {
      this.streamer.broadcast(kind, payload);
    });

    // Initialize lifecycle and results processors
    this.lifecycle = new WorkflowLifecycle(this.logger, context, tokens, events, tasks);
    this.lifecycle.setDurableObjectId(this.state.id.toString());
    this.results = new TaskResultProcessor(this.logger, context, tokens, events, this.lifecycle);

    // Initialize router with handler bindings
    this.router = new RequestRouter(this.logger, {
      execute: this.lifecycle.initialize.bind(this.lifecycle),
      taskResult: this.results.process.bind(this.results),
      pendingData: this.lifecycle.getPendingData.bind(this.lifecycle),
      websocket: this.handleWebSocketUpgrade.bind(this),
    });
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.route(request);
  }

  /**
   * Handle WebSocket upgrade for event streaming.
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const workflowRunId = this.lifecycle.getWorkflowRunId();

    this.logger.info('websocket_connected', {
      workflow_run_id: workflowRunId,
      durable_object_id: this.state.id.toString(),
    });

    return this.streamer.handleUpgrade(request, workflowRunId);
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
