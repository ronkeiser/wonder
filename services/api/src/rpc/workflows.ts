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
    return startWorkflow(serviceCtx, workflowId, input);
  }
}
