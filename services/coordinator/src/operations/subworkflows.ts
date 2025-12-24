/**
 * Subworkflow Operations
 *
 * Manages tracking of subworkflows spawned by this workflow run.
 * Used for:
 * - Tracking parent-child relationships
 * - Cascade cancellation when parent fails/cancels
 * - Looking up which token is waiting for which subworkflow
 */

import type { Emitter } from '@wonder/events';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { subworkflows } from '../schema';
import type { CoordinatorDb } from './db';

/** Subworkflow row type inferred from schema */
export type SubworkflowRow = typeof subworkflows.$inferSelect;

/** Status of a subworkflow */
export type SubworkflowStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * SubworkflowManager manages subworkflow tracking for cascade operations.
 */
export class SubworkflowManager {
  private readonly db: CoordinatorDb;
  private readonly emitter: Emitter;

  constructor(db: CoordinatorDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Register a new subworkflow
   */
  register(params: {
    workflowRunId: string;
    parentTokenId: string;
    subworkflowRunId: string;
    timeoutMs?: number;
  }): string {
    const { workflowRunId, parentTokenId, subworkflowRunId, timeoutMs } = params;
    const id = ulid();
    const now = new Date();

    this.db
      .insert(subworkflows)
      .values({
        id,
        workflowRunId,
        parentTokenId,
        subworkflowRunId,
        status: 'running',
        timeoutMs: timeoutMs ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.subworkflows.registered',
      payload: {
        id,
        parentTokenId,
        subworkflowRunId,
        timeoutMs,
      },
    });

    return id;
  }

  /**
   * Update subworkflow status
   */
  updateStatus(subworkflowRunId: string, status: SubworkflowStatus): void {
    const now = new Date();

    this.db
      .update(subworkflows)
      .set({
        status,
        updatedAt: now,
      })
      .where(eq(subworkflows.subworkflowRunId, subworkflowRunId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.subworkflows.status_updated',
      payload: {
        subworkflowRunId,
        status,
      },
    });
  }

  /**
   * Get all running subworkflows for this workflow run.
   * Used for cascade cancellation.
   */
  getRunning(workflowRunId: string): SubworkflowRow[] {
    return this.db
      .select()
      .from(subworkflows)
      .where(and(eq(subworkflows.workflowRunId, workflowRunId), eq(subworkflows.status, 'running')))
      .all();
  }

  /**
   * Get subworkflow by subworkflow run ID
   */
  getBySubworkflowRunId(subworkflowRunId: string): SubworkflowRow | null {
    const result = this.db
      .select()
      .from(subworkflows)
      .where(eq(subworkflows.subworkflowRunId, subworkflowRunId))
      .limit(1)
      .all();

    return result[0] ?? null;
  }

  /**
   * Get subworkflow by parent token ID
   */
  getByParentTokenId(parentTokenId: string): SubworkflowRow | null {
    const result = this.db
      .select()
      .from(subworkflows)
      .where(eq(subworkflows.parentTokenId, parentTokenId))
      .limit(1)
      .all();

    return result[0] ?? null;
  }

  /**
   * Mark all running subworkflows as cancelled.
   * Used when parent workflow is cancelled/failed.
   */
  cancelAll(workflowRunId: string): string[] {
    const running = this.getRunning(workflowRunId);
    const subworkflowRunIds = running.map((s) => s.subworkflowRunId);

    if (subworkflowRunIds.length > 0) {
      const now = new Date();

      this.db
        .update(subworkflows)
        .set({
          status: 'cancelled',
          updatedAt: now,
        })
        .where(
          and(eq(subworkflows.workflowRunId, workflowRunId), eq(subworkflows.status, 'running')),
        )
        .run();

      this.emitter.emitTrace({
        type: 'operation.subworkflows.cancelled_all',
        payload: {
          workflowRunId,
          count: subworkflowRunIds.length,
          subworkflowRunIds,
        },
      });
    }

    return subworkflowRunIds;
  }
}