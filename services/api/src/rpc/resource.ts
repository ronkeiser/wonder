import { createLogger } from '@wonder/logger';
import { RpcTarget } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { ExecutionServiceContext } from '~/domains/execution/service';

/**
 * Base RPC resource with pre-configured service context
 * All RPC resources should extend this instead of RpcTarget directly
 */
export abstract class Resource extends RpcTarget {
  protected serviceCtx: ExecutionServiceContext;
  protected env: Env;

  constructor(env: Env, ctx: ExecutionContext) {
    super();
    this.env = env;
    const db = drizzle(env.DB);
    const logger = createLogger({ consoleOnly: true });
    this.serviceCtx = {
      db,
      ai: env.AI,
      WORKFLOW_COORDINATOR: env.WORKFLOW_COORDINATOR,
      logger,
      executionContext: ctx,
    };
  }
}
