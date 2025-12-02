import { RpcTarget } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { ServiceContext } from '~/infrastructure/context';

/**
 * Base RPC resource with pre-configured service context
 * All RPC resources should extend this instead of RpcTarget directly
 */
export abstract class Resource extends RpcTarget {
  protected serviceCtx: ServiceContext;
  protected env: Env;

  constructor(env: Env, ctx: ExecutionContext) {
    super();
    this.env = env as any;
    const db = drizzle(env.DB);
    const logger = env.LOGS.newLogger({
      service: 'resources',
      environment: env.ENVIRONMENT ?? 'local',
    });
    this.serviceCtx = {
      db,
      logger,
      executionContext: ctx,
    };
  }
}
