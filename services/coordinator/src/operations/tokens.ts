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
import { ulid } from 'ulid';

import { fanIns, tokens } from '../schema';
import type { CreateTokenParams, SiblingCounts, TokenStatus } from '../types';
import type { CoordinatorDb } from './db';

/** Token row type inferred from schema */
export type TokenRow = typeof tokens.$inferSelect;

/** Terminal states where token execution is finished */
const TERMINAL_STATES: TokenStatus[] = ['completed', 'failed', 'timed_out', 'cancelled'];

/** Active states where token is still in flight (not terminal) */
const ACTIVE_STATES: TokenStatus[] = [
  'pending',
  'dispatched',
  'executing',
  'waiting_for_siblings',
  'waiting_for_subworkflow',
];

/**
 * TokenManager manages token state for a workflow execution.
 *
 * Uses drizzle-orm for type-safe token lifecycle management including
 * creation, status updates, and queries.
 */
export class TokenManager {
  private readonly db: CoordinatorDb;
  private readonly emitter: Emitter;

  constructor(db: CoordinatorDb, emitter: Emitter) {
    this.db = db;
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
        ...params,
        id: tokenId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.tokens.created',
      payload: {
        tokenId: tokenId,
        nodeId: params.nodeId,
        taskId: params.nodeId,
        parentTokenId: params.parentTokenId,
        pathId: params.pathId,
        siblingGroup: params.siblingGroup,
        branchIndex: params.branchIndex,
        branchTotal: params.branchTotal,
      },
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
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, tokenId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.tokens.status_updated',
      payload: {
        tokenId: tokenId,
        nodeId: token.nodeId,
        from: token.status,
        to: status,
      },
    });
  }

  /**
   * Count active tokens for a workflow run
   */
  getActiveCount(workflowRunId: string): number {
    const result = this.db
      .select({ count: count() })
      .from(tokens)
      .where(and(eq(tokens.workflowRunId, workflowRunId), inArray(tokens.status, ACTIVE_STATES)))
      .all();

    return result[0]?.count ?? 0;
  }

  /**
   * Get all active (non-terminal) tokens for a workflow run.
   * Used to cancel in-flight tokens when workflow fails.
   */
  getActiveTokens(workflowRunId: string): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.workflowRunId, workflowRunId), inArray(tokens.status, ACTIVE_STATES)))
      .all();
  }

  // ============================================================================
  // Sibling Queries (for fan-in synchronization)
  // ============================================================================

  /**
   * Get all sibling tokens from a sibling group
   */
  getSiblings(workflowRunId: string, siblingGroup: string): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.workflowRunId, workflowRunId), eq(tokens.siblingGroup, siblingGroup)))
      .all();
  }

  /**
   * Get sibling count breakdown for synchronization checks
   */
  getSiblingCounts(workflowRunId: string, siblingGroup: string): SiblingCounts {
    const siblings = this.getSiblings(workflowRunId, siblingGroup);

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
        arrivedAt: arrivedAt,
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, tokenId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.tokens.status_updated',
      payload: {
        tokenId: tokenId,
        nodeId: token.nodeId,
        from: token.status,
        to: 'waiting_for_siblings',
      },
    });
  }

  /**
   * Get all tokens waiting for siblings in a sibling group
   */
  getWaitingTokens(workflowRunId: string, siblingGroup: string): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.workflowRunId, workflowRunId),
          eq(tokens.siblingGroup, siblingGroup),
          eq(tokens.status, 'waiting_for_siblings'),
        ),
      )
      .all();
  }

  /**
   * Get all waiting tokens across all sibling groups.
   * Used by timeout checking to find tokens that may have timed out.
   */
  getAllWaitingTokens(): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(eq(tokens.status, 'waiting_for_siblings'))
      .all();
  }

  /**
   * Mark token as waiting for a subworkflow to complete
   */
  markWaitingForSubworkflow(tokenId: string, subworkflowRunId: string): void {
    const token = this.get(tokenId);

    this.db
      .update(tokens)
      .set({
        status: 'waiting_for_subworkflow',
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, tokenId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.tokens.status_updated',
      payload: {
        tokenId: tokenId,
        nodeId: token.nodeId,
        from: token.status,
        to: 'waiting_for_subworkflow',
        subworkflowRunId,
      },
    });
  }

  /**
   * Get all tokens waiting for subworkflows.
   * Used by timeout checking for subworkflow timeouts.
   */
  getTokensWaitingForSubworkflow(): TokenRow[] {
    return this.db
      .select()
      .from(tokens)
      .where(eq(tokens.status, 'waiting_for_subworkflow'))
      .all();
  }

  /**
   * Get the oldest arrivedAt timestamp among waiting tokens.
   * Returns null if no tokens are waiting.
   */
  getOldestWaitingTimestamp(): Date | null {
    const waiting = this.getAllWaitingTokens();
    if (waiting.length === 0) return null;

    let oldest: Date | null = null;
    for (const token of waiting) {
      if (token.arrivedAt) {
        if (!oldest || token.arrivedAt < oldest) {
          oldest = token.arrivedAt;
        }
      }
    }
    return oldest;
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
      .where(and(eq(tokens.workflowRunId, workflowRunId), like(tokens.pathId, `${pathPrefix}%`)))
      .all();
  }

  /**
   * Get token's ancestor chain (parent → grandparent → ...)
   */
  getAncestors(tokenId: string): TokenRow[] {
    const ancestors: TokenRow[] = [];
    let currentToken = this.get(tokenId);

    while (currentToken.parentTokenId) {
      const parent = this.get(currentToken.parentTokenId);
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
      .where(and(eq(tokens.workflowRunId, workflowRunId), isNull(tokens.parentTokenId)))
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

    // Batch-fetch tokens before update for tracing (avoid N+1 queries)
    const tokensBefore = this.getMany(tokenIds);
    const tokenMap = new Map(tokensBefore.map((t) => [t.id, t]));

    const now = new Date();

    this.db
      .update(tokens)
      .set({
        status: 'completed',
        updatedAt: now,
      })
      .where(inArray(tokens.id, tokenIds))
      .run();

    for (const tokenId of tokenIds) {
      const token = tokenMap.get(tokenId);
      this.emitter.emitTrace({
        type: 'operation.tokens.status_updated',
        payload: {
          tokenId: tokenId,
          nodeId: token?.nodeId ?? 'unknown',
          from: 'waiting_for_siblings',
          to: 'completed',
        },
      });
    }
  }

  /**
   * Cancel tokens (for early completion patterns)
   */
  cancelMany(tokenIds: string[], _reason?: string): void {
    if (tokenIds.length === 0) return;

    // Batch-fetch tokens before update for tracing (avoid N+1 queries)
    const tokensBefore = this.getMany(tokenIds);
    const tokenMap = new Map(tokensBefore.map((t) => [t.id, t]));

    const now = new Date();

    this.db
      .update(tokens)
      .set({
        status: 'cancelled',
        updatedAt: now,
      })
      .where(inArray(tokens.id, tokenIds))
      .run();

    for (const tokenId of tokenIds) {
      const token = tokenMap.get(tokenId);
      this.emitter.emitTrace({
        type: 'operation.tokens.status_updated',
        payload: {
          tokenId: tokenId,
          nodeId: token?.nodeId ?? 'unknown',
          from: token?.status ?? 'unknown',
          to: 'cancelled',
        },
      });
    }
  }

  // ============================================================================
  // Path Building Utilities
  // ============================================================================

  /**
   * Build pathId for a new token
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

  // ============================================================================
  // Fan-In Operations (race-safe synchronization)
  // ============================================================================

  /** Fan-in row type inferred from schema */
  // Note: Exported type is at module level

  /**
   * Try to create a fan-in record for this path.
   * Returns true if this call created the record (won the race).
   * Returns false if a record already exists (another token won).
   *
   * Uses INSERT OR IGNORE with unique constraint for race safety.
   */
  tryCreateFanIn(params: {
    workflowRunId: string;
    nodeId: string;
    fanInPath: string;
    transitionId: string;
    tokenId: string;
  }): boolean {
    const { workflowRunId, nodeId, fanInPath, transitionId } = params;
    const fanInId = ulid();
    const now = new Date();

    try {
      // INSERT OR IGNORE - if unique constraint violated, nothing happens
      this.db
        .insert(fanIns)
        .values({
          id: fanInId,
          workflowRunId: workflowRunId,
          nodeId: nodeId,
          fanInPath: fanInPath,
          status: 'waiting',
          transitionId: transitionId,
          firstArrivalAt: now,
        })
        .onConflictDoNothing()
        .run();

      // Check if our insert succeeded by querying
      const result = this.db
        .select()
        .from(fanIns)
        .where(and(eq(fanIns.workflowRunId, workflowRunId), eq(fanIns.fanInPath, fanInPath)))
        .limit(1)
        .all();

      const created = result.length > 0 && result[0].id === fanInId;

      return created;
    } catch {
      // Constraint violation means another token already created it
      return false;
    }
  }

  /**
   * Try to activate a fan-in (transition from 'waiting' to 'activated').
   * Returns true if this call activated it (won the race).
   * Returns false if already activated (another token won).
   *
   * Uses UPDATE with status='waiting' condition for race safety.
   * Verifies activation by checking if this token is recorded as activator.
   */
  tryActivateFanIn(params: {
    workflowRunId: string;
    fanInPath: string;
    activatedByTokenId: string;
  }): boolean {
    const { workflowRunId, fanInPath, activatedByTokenId } = params;
    const now = new Date();

    // UPDATE ... WHERE status='waiting' - only succeeds if not already activated
    this.db
      .update(fanIns)
      .set({
        status: 'activated',
        activatedAt: now,
        activatedByTokenId: activatedByTokenId,
      })
      .where(
        and(
          eq(fanIns.workflowRunId, workflowRunId),
          eq(fanIns.fanInPath, fanInPath),
          eq(fanIns.status, 'waiting'),
        ),
      )
      .run();

    // Check if we activated it by verifying our token ID is recorded
    const result = this.db
      .select()
      .from(fanIns)
      .where(and(eq(fanIns.workflowRunId, workflowRunId), eq(fanIns.fanInPath, fanInPath)))
      .limit(1)
      .all();

    const activated =
      result.length > 0 &&
      result[0].status === 'activated' &&
      result[0].activatedByTokenId === activatedByTokenId;

    return activated;
  }

  /**
   * Get fan-in record for a path
   */
  getFanIn(workflowRunId: string, fanInPath: string): typeof fanIns.$inferSelect | null {
    const result = this.db
      .select()
      .from(fanIns)
      .where(and(eq(fanIns.workflowRunId, workflowRunId), eq(fanIns.fanInPath, fanInPath)))
      .limit(1)
      .all();

    return result[0] ?? null;
  }
}
