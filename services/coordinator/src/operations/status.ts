/**
 * Workflow Status Operations
 *
 * Tracks the workflow run's lifecycle status within the coordinator DO.
 * Used to guard against double finalization and prevent completing
 * an already-failed workflow.
 */

import type { Emitter } from '@wonder/events';
import { eq } from 'drizzle-orm';

import { workflowStatus } from '../schema';
import type { WorkflowStatus } from '../types';
import type { CoordinatorDb } from './db';

/** Terminal workflow states where no further transitions are allowed */
const TERMINAL_STATUSES: WorkflowStatus[] = ['completed', 'failed', 'timed_out', 'cancelled'];

/**
 * StatusManager manages workflow lifecycle status.
 *
 * Provides:
 * - Status initialization on workflow start
 * - Status updates with terminal state guards
 * - Status queries for finalization guards
 */
export class StatusManager {
  private readonly db: CoordinatorDb;
  private readonly emitter: Emitter;

  constructor(db: CoordinatorDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Initialize workflow status to 'running'.
   * Called when workflow starts.
   */
  initialize(workflowRunId: string): void {
    const now = new Date();

    this.db
      .insert(workflowStatus)
      .values({
        workflowRunId,
        status: 'running',
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();

    this.emitter.emitTrace({
      type: 'operation.status.initialized',
      payload: { workflowRunId, status: 'running' },
    });
  }

  /**
   * Get current workflow status.
   * Returns null if not initialized.
   */
  get(workflowRunId: string): WorkflowStatus | null {
    const result = this.db
      .select()
      .from(workflowStatus)
      .where(eq(workflowStatus.workflowRunId, workflowRunId))
      .limit(1)
      .all();

    return result[0]?.status ?? null;
  }

  /**
   * Check if workflow is in a terminal state.
   */
  isTerminal(workflowRunId: string): boolean {
    const status = this.get(workflowRunId);
    return status !== null && TERMINAL_STATUSES.includes(status);
  }

  /**
   * Update workflow status.
   * Returns false if workflow is already in a terminal state (guard).
   */
  update(workflowRunId: string, newStatus: WorkflowStatus): boolean {
    const currentStatus = this.get(workflowRunId);

    // Guard: Cannot transition from terminal state
    if (currentStatus !== null && TERMINAL_STATUSES.includes(currentStatus)) {
      this.emitter.emitTrace({
        type: 'operation.status.update_blocked',
        payload: {
          workflowRunId,
          currentStatus,
          attemptedStatus: newStatus,
          reason: 'workflow already in terminal state',
        },
      });
      return false;
    }

    const now = new Date();

    this.db
      .update(workflowStatus)
      .set({
        status: newStatus,
        updatedAt: now,
      })
      .where(eq(workflowStatus.workflowRunId, workflowRunId))
      .run();

    this.emitter.emitTrace({
      type: 'operation.status.updated',
      payload: {
        workflowRunId,
        from: currentStatus,
        to: newStatus,
      },
    });

    return true;
  }

  /**
   * Mark workflow as failed.
   * Returns false if already in terminal state.
   */
  markFailed(workflowRunId: string): boolean {
    return this.update(workflowRunId, 'failed');
  }

  /**
   * Mark workflow as completed.
   * Returns false if already in terminal state.
   */
  markCompleted(workflowRunId: string): boolean {
    return this.update(workflowRunId, 'completed');
  }

  /**
   * Mark workflow as timed out.
   * Returns false if already in terminal state.
   */
  markTimedOut(workflowRunId: string): boolean {
    return this.update(workflowRunId, 'timed_out');
  }
}