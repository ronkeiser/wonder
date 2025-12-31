/**
 * Async Operation Operations
 *
 * Drizzle-based operations for async operation tracking.
 *
 * Tracks async operations (tasks, workflows, agents) that are pending
 * on a turn, enabling the turn to stay active until all async work completes.
 */

import type { Emitter } from '@wonder/events';
import { and, count, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { asyncOps } from '../schema';
import type { AsyncOpTargetType } from '../types';
import type { AgentDb } from './db';

/** Async operation row type inferred from schema */
export type AsyncOpRow = typeof asyncOps.$inferSelect;

/** Track async operation parameters */
export type TrackAsyncOpParams = {
  turnId: string;
  targetType: AsyncOpTargetType;
  targetId: string;
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
   */
  track(params: TrackAsyncOpParams): string {
    const opId = ulid();
    const now = new Date();

    this.db
      .insert(asyncOps)
      .values({
        id: opId,
        turnId: params.turnId,
        targetType: params.targetType,
        targetId: params.targetId,
        status: 'pending',
        createdAt: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.async.tracked',
      payload: {
        opId,
        turnId: params.turnId,
        targetType: params.targetType,
        targetId: params.targetId,
      },
    });

    return opId;
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
}
