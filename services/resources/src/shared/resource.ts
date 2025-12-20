import { createLogger } from '@wonder/logs';
import { RpcTarget } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { ServiceContext } from '~/shared/context';
import { computeContentHash } from './fingerprint';

/**
 * Repository functions required for autoversioning.
 */
export interface AutoversionRepo<TEntity> {
  /** Find an existing entity by name, content hash, and optional scope */
  findByNameAndHash(
    name: string,
    hash: string,
    scope?: { project_id?: string | null; library_id?: string | null },
  ): Promise<TEntity | null>;

  /** Get the maximum version number for a name within optional scope */
  getMaxVersion(
    name: string,
    scope?: { project_id?: string | null; library_id?: string | null },
  ): Promise<number>;
}

/**
 * Result of autoversion check.
 */
export type AutoversionResult<TEntity> =
  | { reused: true; entity: TEntity; contentHash: string }
  | { reused: false; version: number; contentHash: string };

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
      this.serviceCtx.logger.error({
        eventType: `${resourceName}.${operationName}.error`,
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

  /**
   * Get the resource name in snake_case (derived from class name).
   */
  protected get resourceName(): string {
    return this.constructor.name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .slice(1);
  }

  /**
   * Handles autoversion logic: checks for existing matching content or determines next version.
   *
   * @param data - The input data (must include `name` and optionally `autoversion`)
   * @param repo - Repository functions for finding existing entities and getting max version
   * @param scope - Optional scope for scoped resources (project_id, library_id)
   * @returns Either the existing entity (reused) or the version number to use for creation
   */
  protected async withAutoversion<TEntity>(
    data: Record<string, unknown> & { name: string; autoversion?: boolean },
    repo: AutoversionRepo<TEntity>,
    scope?: { project_id?: string | null; library_id?: string | null },
  ): Promise<AutoversionResult<TEntity>> {
    if (!data.autoversion) {
      // Non-autoversion path: use version 1, no content hash needed for lookup
      // but we still compute it for storage
      const contentHash = await computeContentHash(data);
      return { reused: false, version: 1, contentHash };
    }

    const contentHash = await computeContentHash(data);

    // Check for existing entity with same name + content
    const existing = await repo.findByNameAndHash(data.name, contentHash, scope);

    if (existing) {
      this.serviceCtx.logger.info({
        eventType: `${this.resourceName}.autoversion.matched`,
        metadata: {
          name: data.name,
          content_hash: contentHash,
        },
      });

      return { reused: true, entity: existing, contentHash };
    }

    // No exact match - determine version number
    const maxVersion = await repo.getMaxVersion(data.name, scope);
    const newVersion = maxVersion + 1;

    this.serviceCtx.logger.info({
      eventType: `${this.resourceName}.autoversion.creating`,
      metadata: {
        name: data.name,
        version: newVersion,
        content_hash: contentHash,
        existing_max_version: maxVersion,
      },
    });

    return { reused: false, version: newVersion, contentHash };
  }
}
