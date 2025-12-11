/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 */
import { createEmitter, type Emitter } from '@wonder/events';
import { DurableObject } from 'cloudflare:workers';

/**
 * WorkflowCoordinator Durable Object
 *
 * Each instance coordinates a single workflow run.
 */
export class WorkflowCoordinator extends DurableObject {
  private emitter?: Emitter;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /**
   * Start workflow execution
   */
  async start(
    input: Record<string, unknown>,
    context: {
      workflow_run_id: string;
      workspace_id: string;
      project_id: string;
      workflow_def_id: string;
    },
  ): Promise<void> {
    // Initialize emitter with full context
    this.emitter = createEmitter(this.env.EVENTS, context, {
      traceEnabled: this.env.TRACE_EVENTS_ENABLED,
    });

    // Emit workflow started event
    this.emitter.emit({
      event_type: 'workflow_started',
      message: `Workflow started`,
      metadata: { input },
    });

    // TODO: Load workflow definition and begin execution
    // For now, immediately complete the workflow for testing
    this.emitter.emit({
      event_type: 'workflow_completed',
      message: `Workflow completed`,
      metadata: { output: {} },
    });
  }
}

/**
 * Worker entrypoint
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('OK', {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
