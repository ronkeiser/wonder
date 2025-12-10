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
  private emitter: Emitter;
  private workflowRunId: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Generate workflow run ID (in real implementation, this comes from initialization)
    this.workflowRunId = 'run_placeholder';

    // Initialize emitter with context bound at creation
    // Note: In real implementation, workspace_id, project_id, and workflow_def_id
    // come from workflow initialization or metadata storage
    this.emitter = createEmitter(
      env.EVENTS,
      {
        workflow_run_id: this.workflowRunId,
        workspace_id: 'ws_placeholder',
        project_id: 'proj_placeholder',
        workflow_def_id: 'wf_placeholder',
      },
      {
        traceEnabled: env.TRACE_EVENTS_ENABLED === 'true',
      },
    );
  }

  async sayHello(name: string): Promise<string> {
    // Example: emit workflow event
    this.emitter.emit({
      event_type: 'workflow_started',
      message: `Workflow started for ${name}`,
    });

    // Example: emit trace event (token_id required for decision.routing.start)
    this.emitter.emitTrace({
      type: 'decision.routing.start',
      token_id: 'tok_example',
      node_id: 'start_node',
    });

    return `Hello, ${name}!`;
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
