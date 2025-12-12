/**
 * Token Operations
 *
 * Drizzle-based operations for token state management.
 */

import type { Emitter } from '@wonder/events';
import { and, count, eq, inArray } from 'drizzle-orm';
import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { ulid } from 'ulid';

import * as schema from '../schemas';
import { tokens, type TokenStatus } from '../schemas.js';
import type { DefinitionManager } from './defs.js';

/** Token row type inferred from schema */
export type TokenRow = typeof tokens.$inferSelect;

/** Parameters for creating a new token */
export type CreateTokenParams = {
  workflow_run_id: string;
  node_id: string;
  parent_token_id: string | null;
  path_id: string;
  fan_out_transition_id: string | null;
  branch_index: number;
  branch_total: number;
};

/**
 * TokenManager manages token state for a workflow execution.
 *
 * Uses drizzle-orm for type-safe token lifecycle management including
 * creation, status updates, and queries.
 */
export class TokenManager {
  private readonly db: DrizzleSqliteDODatabase<typeof schema>;
  private readonly defs: DefinitionManager;
  private readonly emitter: Emitter;

  constructor(ctx: DurableObjectState, defs: DefinitionManager, emitter: Emitter) {
    this.db = drizzle(ctx.storage, { schema });
    this.defs = defs;
    this.emitter = emitter;
  }

  /**
   * Create a new token
   */
  create(params: CreateTokenParams): string {
    const tokenId = ulid();
    const now = new Date();

    this.db
      .insert(tokens)
      .values({
        id: tokenId,
        workflow_run_id: params.workflow_run_id,
        node_id: params.node_id,
        status: 'pending',
        parent_token_id: params.parent_token_id,
        path_id: params.path_id,
        fan_out_transition_id: params.fan_out_transition_id,
        branch_index: params.branch_index,
        branch_total: params.branch_total,
        created_at: now,
        updated_at: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.tokens.create',
      token_id: tokenId,
      node_id: params.node_id,
      task_id: params.node_id,
      parent_token_id: params.parent_token_id,
    });

    return tokenId;
  }

  /**
   * Get token by ID
   */
  get(tokenId: string): TokenRow {
    const result = this.db.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1).all();

    if (result.length === 0) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    return result[0];
  }

  /**
   * Update token status
   */
  updateStatus(tokenId: string, status: TokenStatus): void {
    const token = this.get(tokenId);

    this.db
      .update(tokens)
      .set({
        status,
        updated_at: new Date(),
      })
      .where(eq(tokens.id, tokenId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.tokens.update_status',
      token_id: tokenId,
      from: token.status,
      to: status,
    });
  }

  /**
   * Count active tokens for a workflow run
   */
  getActiveCount(workflowRunId: string): number {
    const result = this.db
      .select({ count: count() })
      .from(tokens)
      .where(
        and(
          eq(tokens.workflow_run_id, workflowRunId),
          inArray(tokens.status, ['pending', 'dispatched', 'executing']),
        ),
      )
      .all();

    return result[0]?.count ?? 0;
  }
}
