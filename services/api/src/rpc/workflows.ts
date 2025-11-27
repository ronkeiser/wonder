import { startWorkflow } from '~/domains/execution/service';
import { Resource } from './resource';

/**
 * Workflows RPC resource
 * Exposes workflow operations for RPC calls from web service
 */
export class Workflows extends Resource {
  /**
   * Start a workflow execution
   */
  async start(workflowId: string, input: Record<string, unknown>) {
    const workflowRun = await startWorkflow(this.serviceCtx, workflowId, input);
    return {
      workflow_run_id: workflowRun.id,
      durable_object_id: workflowRun.durable_object_id,
    };
  }

  /**
   * Stream coordinator events via WebSocket
   * Forwards WebSocket upgrade request to the Durable Object
   */
  async streamCoordinator(doId: string, request: Request): Promise<Response> {
    const id = this.env.WORKFLOW_COORDINATOR.idFromString(doId);
    const stub = this.env.WORKFLOW_COORDINATOR.get(id);

    // Create new request with /stream path for DO
    const doUrl = new URL(request.url);
    doUrl.pathname = '/stream';
    const doRequest = new Request(doUrl, request);

    return await stub.fetch(doRequest);
  }
}
