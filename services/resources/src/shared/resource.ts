import { createLogger } from '@wonder/logs';
import { RpcTarget } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { ServiceContext } from '~/shared/context';

/**
 * Base RPC resource with pre-configured service context.
 * All RPC resources should extend this instead of RpcTarget directly.
 */
export abstract class Resource extends RpcTarget {
  protected serviceCtx: ServiceContext;
  protected env: Env;

  constructor(env: Env, ctx: ExecutionContext) {
    super();
    this.env = env as any;
    const db = drizzle(env.DB, { casing: 'snake_case' });
    const logger = createLogger(ctx, env.LOGS, {
      service: env.SERVICE,
      environment: env.ENVIRONMENT,
    });
    this.serviceCtx = {
      db,
      logger,
      executionContext: ctx,
    };
  }

  /**
   * Wraps an async operation with automatic start/complete/error logging.
   */
  protected async withLogging<T>(
    operation: string,
    context: Record<string, any>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const resourceName = this.constructor.name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .slice(1);

    const operationName = operation.replace(/([A-Z])/g, '_$1').toLowerCase();

    this.serviceCtx.logger.info({
      eventType: `${resourceName}.${operationName}.started`,
      ...context,
    });

    try {
      const result = await fn();

      this.serviceCtx.logger.info({
        eventType: `${resourceName}.${operationName}.completed`,
        ...context,
      });

      return result;
    } catch (error) {
      const errorInfo: Record<string, unknown> = {
        error_name: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };

      if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        if ('cause' in err) errorInfo.cause = String(err.cause);
        if ('code' in err) errorInfo.code = err.code;
        if ('errno' in err) errorInfo.errno = err.errno;
        if ('meta' in err) errorInfo.meta = err.meta;
        if ('query' in err) errorInfo.query = err.query;
        if ('params' in err) errorInfo.params = err.params;
      }

      this.serviceCtx.logger.error({
        eventType: `${resourceName}.${operationName}.error`,
        message: error instanceof Error ? error.message : String(error),
        ...context,
        metadata: {
          ...context.metadata,
          ...errorInfo,
        },
      });
      throw error;
    }
  }
}
