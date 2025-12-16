import { createLogger } from '@wonder/logs';
import { RpcTarget } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { ServiceContext } from '~/context';

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
   * Wraps an async operation with automatic start/complete/error logging
   * @param operation - The operation name (e.g., 'get', 'delete', 'complete')
   * @param context - Context to include in all log events (e.g., workflow_run_id, trace_id)
   * @param fn - The async operation to execute
   * @returns The result of the operation
   * @throws Re-throws the original error after logging
   */
  protected async withLogging<T>(
    operation: string,
    context: Record<string, any>,
    fn: () => Promise<T>,
  ): Promise<T> {
    // Generate resource name from class name (e.g., 'WorkflowRuns' -> 'workflow_runs')
    const resourceName = this.constructor.name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .slice(1);

    // Convert operation name to dot notation (e.g., 'updateStatus' -> 'update_status')
    const operationName = operation.replace(/([A-Z])/g, '_$1').toLowerCase();

    this.serviceCtx.logger.info({
      event_type: `${resourceName}.${operationName}.started`,
      ...context,
    });

    try {
      const result = await fn();

      this.serviceCtx.logger.info({
        event_type: `${resourceName}.${operationName}.completed`,
        ...context,
      });

      return result;
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: `${resourceName}.${operationName}.error`,
        message: error instanceof Error ? error.message : String(error),
        ...context,
        metadata: {
          ...context.metadata,
          error_name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }
}
