/**
 * Token Operations
 *
 * Drizzle-based operations for token state management.
 *
 * Supports full branching strategy including:
 * - Token creation with lineage tracking
 * - Sibling queries for fan-in synchronization
 * - Waiting state management
 * - Path-based queries for nested fan-in
 * - Bulk operations for efficient merge
 */

import type { Emitter } from '@wonder/events';
import { and, count, eq, inArray, isNull, like } from 'drizzle-orm';
import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { ulid } from 'ulid';

import * as schema from '../schemas';
import { tokens, type TokenStatus } from '../schemas.js';
import type { DefinitionManager } from './defs.js';

/** Token row type inferred from schema */
export type TokenRow = typeof tokens.$inferSelect;

/** Terminal states where token execution is finished */
const TERMINAL_STATES: TokenStatus[] = ['completed', 'failed', 'timed_out', 'cancelled'];

/** Active states where token is still executing */
const ACTIVE_STATES: TokenStatus[] = ['pending', 'dispatched', 'executing'];

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

/** Sibling count breakdown for synchronization checks */
export type SiblingCounts = {
  total: number;
  completed: number;
  failed: number;
  waiting: number;
  terminal: number; // completed + failed + timed_out + cancelled
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
      .where(and(eq(tokens.workflow_run_id, workflowRunId), inArray(tokens.status, ACTIVE_STATES)))
      .all();

    return result[0]?.count ?? 0;
  }

  // ============================================================================
  // Sibling Queries (for fan-in synchronization)
  // ============================================================================

  /**
   * Get all sibling tokens from a fan-out transition
   */
  getSiblings(workflowRunId: string, fanOutTransitionId: string): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.workflow_run_id, workflowRunId),
          eq(tokens.fan_out_transition_id, fanOutTransitionId),
        ),
      )
      .all();
  }

  /**
   * Get sibling count breakdown for synchronization checks
   */
  getSiblingCounts(workflowRunId: string, fanOutTransitionId: string): SiblingCounts {
    const siblings = this.getSiblings(workflowRunId, fanOutTransitionId);

    const counts: SiblingCounts = {
      total: siblings.length,
      completed: 0,
      failed: 0,
      waiting: 0,
      terminal: 0,
    };

    for (const sibling of siblings) {
      if (sibling.status === 'completed') counts.completed++;
      if (sibling.status === 'failed') counts.failed++;
      if (sibling.status === 'waiting_for_siblings') counts.waiting++;
      if (TERMINAL_STATES.includes(sibling.status)) counts.terminal++;
    }

    return counts;
  }

  // ============================================================================
  // Waiting State Management
  // ============================================================================

  /**
   * Mark token as waiting for siblings at fan-in
   */
  markWaitingForSiblings(tokenId: string, arrivedAt: Date): void {
    const token = this.get(tokenId);

    this.db
      .update(tokens)
      .set({
        status: 'waiting_for_siblings',
        arrived_at: arrivedAt,
        updated_at: new Date(),
      })
      .where(eq(tokens.id, tokenId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.tokens.update_status',
      token_id: tokenId,
      from: token.status,
      to: 'waiting_for_siblings',
    });
  }

  /**
   * Get all tokens waiting for siblings in a fan-out group
   */
  getWaitingTokens(workflowRunId: string, fanOutTransitionId: string): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.workflow_run_id, workflowRunId),
          eq(tokens.fan_out_transition_id, fanOutTransitionId),
          eq(tokens.status, 'waiting_for_siblings'),
        ),
      )
      .all();
  }

  // ============================================================================
  // Path-based Queries (for lineage traversal)
  // ============================================================================

  /**
   * Get all tokens with a specific path prefix (for nested fan-in)
   * Path format: root[.nodeId.branchIndex]*
   */
  getByPathPrefix(workflowRunId: string, pathPrefix: string): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.workflow_run_id, workflowRunId), like(tokens.path_id, `${pathPrefix}%`)))
      .all();
  }

  /**
   * Get token's ancestor chain (parent → grandparent → ...)
   */
  getAncestors(tokenId: string): TokenRow[] {
    const ancestors: TokenRow[] = [];
    let currentToken = this.get(tokenId);

    while (currentToken.parent_token_id) {
      const parent = this.get(currentToken.parent_token_id);
      ancestors.push(parent);
      currentToken = parent;
    }

    return ancestors;
  }

  /**
   * Get the root token for a workflow run
   */
  getRootToken(workflowRunId: string): TokenRow | null {
    const result = this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.workflow_run_id, workflowRunId), isNull(tokens.parent_token_id)))
      .limit(1)
      .all();

    return result[0] ?? null;
  }

  // ============================================================================
  // Bulk Operations (for efficient fan-in merge)
  // ============================================================================

  /**
   * Get multiple tokens by IDs
   */
  getMany(tokenIds: string[]): TokenRow[] {
    if (tokenIds.length === 0) return [];

    return this.db.select().from(tokens).where(inArray(tokens.id, tokenIds)).all();
  }

  /**
   * Mark multiple tokens as completed after merge
   */
  completeMany(tokenIds: string[]): void {
    if (tokenIds.length === 0) return;

    const now = new Date();

    this.db
      .update(tokens)
      .set({
        status: 'completed',
        updated_at: now,
      })
      .where(inArray(tokens.id, tokenIds))
      .run();

    for (const tokenId of tokenIds) {
      this.emitter.emitTrace({
        type: 'operation.tokens.update_status',
        token_id: tokenId,
        from: 'waiting_for_siblings',
        to: 'completed',
      });
    }
  }

  /**
   * Cancel tokens (for early completion patterns)
   */
  cancelMany(tokenIds: string[], reason?: string): void {
    if (tokenIds.length === 0) return;

    const now = new Date();

    this.db
      .update(tokens)
      .set({
        status: 'cancelled',
        updated_at: now,
      })
      .where(inArray(tokens.id, tokenIds))
      .run();

    for (const tokenId of tokenIds) {
      this.emitter.emitTrace({
        type: 'operation.tokens.update_status',
        token_id: tokenId,
        from: 'executing',
        to: 'cancelled',
      });
    }
  }

  // ============================================================================
  // Path Building Utilities
  // ============================================================================

  /**
   * Build path_id for a new token
   * Format: parentPath[.nodeId.branchIndex] (only adds if fan-out)
   */
  buildPathId(
    parentPath: string,
    nodeId: string,
    branchIndex: number,
    branchTotal: number,
  ): string {
    if (branchTotal > 1) {
      return `${parentPath}.${nodeId}.${branchIndex}`;
    }
    // No fan-out: don't extend path
    return parentPath;
  }
}
