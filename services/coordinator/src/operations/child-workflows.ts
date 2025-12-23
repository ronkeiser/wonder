/**
 * Child Workflow Operations
 *
 * Manages tracking of child workflows spawned by this workflow run.
 * Used for:
 * - Tracking parent-child relationships
 * - Cascade cancellation when parent fails/cancels
 * - Looking up which token is waiting for which child
 */

import type { Emitter } from '@wonder/events';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { childWorkflows } from '../schema';
import type { CoordinatorDb } from './db';

/** Child workflow row type inferred from schema */
export type ChildWorkflowRow = typeof childWorkflows.$inferSelect;

/** Status of a child workflow */
export type ChildWorkflowStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * ChildWorkflowManager manages child workflow tracking for cascade operations.
 */
export class ChildWorkflowManager {
  private readonly db: CoordinatorDb;
  private readonly emitter: Emitter;

  constructor(db: CoordinatorDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Register a new child workflow
   */
  register(params: {
    workflowRunId: string;
    parentTokenId: string;
    childRunId: string;
    timeoutMs?: number;
  }): string {
    const { workflowRunId, parentTokenId, childRunId, timeoutMs } = params;
    const id = ulid();
    const now = new Date();

    this.db
      .insert(childWorkflows)
      .values({
        id,
        workflowRunId,
        parentTokenId,
        childRunId,
        status: 'running',
        timeoutMs: timeoutMs ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.child_workflows.registered',
      payload: {
        id,
        parentTokenId,
        childRunId,
        timeoutMs,
      },
    });

    return id;
  }

  /**
   * Update child workflow status
   */
  updateStatus(childRunId: string, status: ChildWorkflowStatus): void {
    const now = new Date();

    this.db
      .update(childWorkflows)
      .set({
        status,
        updatedAt: now,
      })
      .where(eq(childWorkflows.childRunId, childRunId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.child_workflows.status_updated',
      payload: {
        childRunId,
        status,
      },
    });
  }

  /**
   * Get all running child workflows for this workflow run.
   * Used for cascade cancellation.
   */
  getRunning(workflowRunId: string): ChildWorkflowRow[] {
    return this.db
      .select()
      .from(childWorkflows)
      .where(
        and(eq(childWorkflows.workflowRunId, workflowRunId), eq(childWorkflows.status, 'running')),
      )
      .all();
  }

  /**
   * Get child workflow by child run ID
   */
  getByChildRunId(childRunId: string): ChildWorkflowRow | null {
    const result = this.db
      .select()
      .from(childWorkflows)
      .where(eq(childWorkflows.childRunId, childRunId))
      .limit(1)
      .all();

    return result[0] ?? null;
  }

  /**
   * Get child workflow by parent token ID
   */
  getByParentTokenId(parentTokenId: string): ChildWorkflowRow | null {
    const result = this.db
      .select()
      .from(childWorkflows)
      .where(eq(childWorkflows.parentTokenId, parentTokenId))
      .limit(1)
      .all();

    return result[0] ?? null;
  }

  /**
   * Mark all running children as cancelled.
   * Used when parent workflow is cancelled/failed.
   */
  cancelAll(workflowRunId: string): string[] {
    const running = this.getRunning(workflowRunId);
    const childRunIds = running.map((c) => c.childRunId);

    if (childRunIds.length > 0) {
      const now = new Date();

      this.db
        .update(childWorkflows)
        .set({
          status: 'cancelled',
          updatedAt: now,
        })
        .where(
          and(
            eq(childWorkflows.workflowRunId, workflowRunId),
            eq(childWorkflows.status, 'running'),
          ),
        )
        .run();

      this.emitter.emitTrace({
        type: 'operation.child_workflows.cancelled_all',
        payload: {
          workflowRunId,
          count: childRunIds.length,
          childRunIds,
        },
      });
    }

    return childRunIds;
  }
}
