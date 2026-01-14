/**
 * Async Operation Operations
 *
 * Drizzle-based operations for async operation tracking.
 *
 * Tracks async operations (tasks, workflows, agents) that are pending
 * on a turn, enabling the turn to stay active until all async work completes.
 */

import type { Emitter } from '@wonder/events';
import { and, count, eq, lt, isNotNull, asc } from 'drizzle-orm';

import { asyncOps } from '../schema';
import type { AsyncOpTargetType } from '../types';
import type { AgentDb } from './db';

/** Async operation row type inferred from schema */
export type AsyncOpRow = typeof asyncOps.$inferSelect;

/** Retry configuration for async operations */
export type RetryConfig = {
  maxAttempts: number;
  backoffMs: number;
};

/** Track async operation parameters */
export type TrackAsyncOpParams = {
  /** Operation ID - typically the toolCallId */
  opId: string;
  turnId: string;
  targetType: AsyncOpTargetType;
  targetId: string;
  /** Optional timeout timestamp (ms since epoch) */
  timeoutAt?: number;
  /** Optional retry configuration */
  retry?: RetryConfig;
};

/**
 * AsyncOpManager tracks async operations pending on a turn.
 *
 * When a tool is invoked with async: true, the operation is tracked here.
 * The turn stays active until all tracked operations complete or fail.
 */
export class AsyncOpManager {
  private readonly db: AgentDb;
  private readonly emitter: Emitter;

  constructor(db: AgentDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Track a new async operation.
   *
   * The opId should be the toolCallId to ensure a single operation per tool call.
   */
  track(params: TrackAsyncOpParams): void {
    const now = new Date();

    this.db
      .insert(asyncOps)
      .values({
        id: params.opId,
        turnId: params.turnId,
        targetType: params.targetType,
        targetId: params.targetId,
        status: 'pending',
        createdAt: now,
        timeoutAt: params.timeoutAt ? new Date(params.timeoutAt) : null,
        attemptNumber: 1,
        maxAttempts: params.retry?.maxAttempts ?? 1,
        backoffMs: params.retry?.backoffMs ?? null,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.async.tracked',
      payload: {
        opId: params.opId,
        turnId: params.turnId,
        targetType: params.targetType,
        targetId: params.targetId,
        timeoutAt: params.timeoutAt,
        maxAttempts: params.retry?.maxAttempts ?? 1,
      },
    });
  }

  /**
   * Get async operation by ID.
   */
  get(opId: string): AsyncOpRow | null {
    const result = this.db.select().from(asyncOps).where(eq(asyncOps.id, opId)).limit(1).all();

    return result[0] ?? null;
  }

  /**
   * Mark operation as completed.
   * Returns false if operation not found or already in terminal state.
   */
  complete(opId: string, result: unknown): boolean {
    const op = this.get(opId);

    if (!op) {
      this.emitter.emitTrace({
        type: 'operation.async.complete_failed',
        payload: { opId, reason: 'operation not found' },
      });
      return false;
    }

    if (op.status !== 'pending') {
      this.emitter.emitTrace({
        type: 'operation.async.complete_blocked',
        payload: {
          opId,
          currentStatus: op.status,
          reason: 'operation not pending',
        },
      });
      return false;
    }

    const now = new Date();

    this.db
      .update(asyncOps)
      .set({
        status: 'completed',
        result,
        completedAt: now,
      })
      .where(eq(asyncOps.id, opId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.async.completed',
      payload: {
        opId,
        turnId: op.turnId,
        targetType: op.targetType,
        targetId: op.targetId,
      },
    });

    return true;
  }

  /**
   * Mark operation as failed.
   * Returns false if operation not found or already in terminal state.
   */
  fail(opId: string, error: unknown): boolean {
    const op = this.get(opId);

    if (!op) {
      this.emitter.emitTrace({
        type: 'operation.async.fail_failed',
        payload: { opId, reason: 'operation not found' },
      });
      return false;
    }

    if (op.status !== 'pending') {
      this.emitter.emitTrace({
        type: 'operation.async.fail_blocked',
        payload: {
          opId,
          currentStatus: op.status,
          reason: 'operation not pending',
        },
      });
      return false;
    }

    const now = new Date();

    this.db
      .update(asyncOps)
      .set({
        status: 'failed',
        result: error,
        completedAt: now,
      })
      .where(eq(asyncOps.id, opId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.async.failed',
      payload: {
        opId,
        turnId: op.turnId,
        targetType: op.targetType,
        targetId: op.targetId,
        error,
      },
    });

    return true;
  }

  /**
   * Get pending operations for a turn.
   */
  getPending(turnId: string): AsyncOpRow[] {
    return this.db
      .select()
      .from(asyncOps)
      .where(and(eq(asyncOps.turnId, turnId), eq(asyncOps.status, 'pending')))
      .all();
  }

  /**
   * Get all operations for a turn (any status).
   */
  getForTurn(turnId: string): AsyncOpRow[] {
    return this.db.select().from(asyncOps).where(eq(asyncOps.turnId, turnId)).all();
  }

  /**
   * Check if turn has pending operations.
   */
  hasPending(turnId: string): boolean {
    const result = this.db
      .select({ count: count() })
      .from(asyncOps)
      .where(and(eq(asyncOps.turnId, turnId), eq(asyncOps.status, 'pending')))
      .all();

    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Count pending operations for a turn.
   */
  getPendingCount(turnId: string): number {
    const result = this.db
      .select({ count: count() })
      .from(asyncOps)
      .where(and(eq(asyncOps.turnId, turnId), eq(asyncOps.status, 'pending')))
      .all();

    return result[0]?.count ?? 0;
  }

  /**
   * Mark an operation as waiting (for sync tool dispatch).
   *
   * Used when a sync tool is dispatched and the turn needs to wait
   * for the result before continuing the LLM loop.
   */
  markWaiting(turnId: string, operationId: string): void {
    // First, ensure the operation exists (track it if not)
    let op = this.get(operationId);

    if (!op) {
      // Track the operation as waiting
      const now = new Date();
      this.db
        .insert(asyncOps)
        .values({
          id: operationId,
          turnId,
          targetType: 'task', // Default, will be updated by dispatch
          targetId: operationId,
          status: 'waiting',
          createdAt: now,
        })
        .run();

      this.emitter.emitTrace({
        type: 'operation.async.marked_waiting',
        payload: { opId: operationId, turnId },
      });
      return;
    }

    // Update existing operation to waiting
    this.db
      .update(asyncOps)
      .set({ status: 'waiting' })
      .where(eq(asyncOps.id, operationId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.async.marked_waiting',
      payload: { opId: operationId, turnId: op.turnId },
    });
  }

  /**
   * Resume from a sync tool result.
   *
   * Called when a sync tool completes and we need to continue the LLM loop.
   * This marks the operation as completed with the result.
   */
  resume(operationId: string, result: unknown): boolean {
    const op = this.get(operationId);

    if (!op) {
      this.emitter.emitTrace({
        type: 'operation.async.resume_failed',
        payload: { opId: operationId, reason: 'operation not found' },
      });
      return false;
    }

    if (op.status !== 'waiting' && op.status !== 'pending') {
      this.emitter.emitTrace({
        type: 'operation.async.resume_blocked',
        payload: {
          opId: operationId,
          currentStatus: op.status,
          reason: 'operation not waiting or pending',
        },
      });
      return false;
    }

    const now = new Date();

    this.db
      .update(asyncOps)
      .set({
        status: 'completed',
        result,
        completedAt: now,
      })
      .where(eq(asyncOps.id, operationId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.async.resumed',
      payload: {
        opId: operationId,
        turnId: op.turnId,
        targetType: op.targetType,
      },
    });

    return true;
  }

  /**
   * Check if turn has any waiting operations.
   */
  hasWaiting(turnId: string): boolean {
    const result = this.db
      .select({ count: count() })
      .from(asyncOps)
      .where(and(eq(asyncOps.turnId, turnId), eq(asyncOps.status, 'waiting')))
      .all();

    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Get operations that have timed out.
   *
   * Returns pending/waiting operations where timeoutAt < now.
   */
  getTimedOut(now: Date): AsyncOpRow[] {
    return this.db
      .select()
      .from(asyncOps)
      .where(
        and(
          isNotNull(asyncOps.timeoutAt),
          lt(asyncOps.timeoutAt, now),
          // Only pending or waiting ops can timeout
          // (completed/failed are already terminal)
          eq(asyncOps.status, 'pending'),
        ),
      )
      .all();
  }

  /**
   * Get the earliest timeout timestamp across all pending operations.
   *
   * Used to schedule the next alarm.
   * Returns null if no pending operations have timeouts.
   */
  getEarliestTimeout(): Date | null {
    const result = this.db
      .select({ timeoutAt: asyncOps.timeoutAt })
      .from(asyncOps)
      .where(
        and(
          isNotNull(asyncOps.timeoutAt),
          eq(asyncOps.status, 'pending'),
        ),
      )
      .orderBy(asc(asyncOps.timeoutAt))
      .limit(1)
      .all();

    return result[0]?.timeoutAt ?? null;
  }

  /**
   * Check if an operation can be retried.
   *
   * Returns true if:
   * - Operation exists and is failed
   * - attemptNumber < maxAttempts
   * - Error was retriable (not a permanent failure)
   */
  canRetry(opId: string): boolean {
    const op = this.get(opId);
    if (!op) return false;
    if (op.status !== 'failed') return false;

    const attemptNumber = op.attemptNumber ?? 1;
    const maxAttempts = op.maxAttempts ?? 1;

    return attemptNumber < maxAttempts;
  }

  /**
   * Prepare an operation for retry.
   *
   * - Increments attempt number
   * - Resets status to pending
   * - Calculates new timeout based on backoff
   * - Stores last error for debugging
   *
   * Returns the new timeout timestamp for alarm scheduling,
   * or null if the operation cannot be retried.
   */
  prepareRetry(opId: string, error: string): number | null {
    const op = this.get(opId);
    if (!op) return null;

    const attemptNumber = op.attemptNumber ?? 1;
    const maxAttempts = op.maxAttempts ?? 1;

    if (attemptNumber >= maxAttempts) {
      this.emitter.emitTrace({
        type: 'operation.async.retry_exhausted',
        payload: {
          opId,
          attemptNumber,
          maxAttempts,
        },
      });
      return null;
    }

    const newAttemptNumber = attemptNumber + 1;
    const backoffMs = op.backoffMs ?? 1000;
    const now = Date.now();
    const newTimeoutAt = now + backoffMs;

    this.db
      .update(asyncOps)
      .set({
        status: 'pending',
        attemptNumber: newAttemptNumber,
        timeoutAt: new Date(newTimeoutAt),
        lastError: error,
        result: null,
        completedAt: null,
      })
      .where(eq(asyncOps.id, opId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.async.retry_scheduled',
      payload: {
        opId,
        turnId: op.turnId,
        attemptNumber: newAttemptNumber,
        maxAttempts,
        retryAt: newTimeoutAt,
      },
    });

    return newTimeoutAt;
  }
}
