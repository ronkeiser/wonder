import { createLogger } from '@wonder/logger';
import { RpcTarget } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { startWorkflow } from '~/domains/execution/service';

/**
 * Workflows RPC adapter
 * Exposes workflow operations for RPC calls from web service
 */
export class Workflows extends RpcTarget {
  constructor(private env: Env, private ctx: ExecutionContext) {
    super();
  }

  /**
   * Start a workflow execution
   */
  async start(workflowId: string, input: Record<string, unknown>) {
    const db = drizzle(this.env.DB);
    const logger = createLogger({ consoleOnly: true });
    const serviceCtx = {
      db,
      ai: this.env.AI,
      WORKFLOW_COORDINATOR: this.env.WORKFLOW_COORDINATOR,
      logger,
      executionContext: this.ctx,
    };
    const workflowRun = await startWorkflow(serviceCtx, workflowId, input);
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
