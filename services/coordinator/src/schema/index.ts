/**
 * Coordinator DO SQLite Schemas
 *
 * Two categories:
 * 1. Definition tables - imported from @wonder/resources/schemas
 * 2. Execution tables - internal coordinator state (tokens, fanIns)
 *
 * Note: Migration SQL is manually edited to remove FK constraints since
 * the DO's isolated SQLite doesn't have the referenced tables (projects, workflows).
 */

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { TokenStatus, WorkflowStatus } from '../types';

// Re-export for consumers that import from schema
export type { TokenStatus, WorkflowStatus } from '../types';

/**
 * Definition tables (imported from Resources service)
 */
export { definitions, nodes, transitions, workflowRuns } from '@wonder/resources/schemas';

// Legacy snake_case re-exports for backward compatibility during migration
export { workflowRuns as workflow_runs } from '@wonder/resources/schemas';

/**
 * Execution tables (internal coordinator state)
 */

/**
 * Tokens track execution position within a workflow run.
 */
export const tokens = sqliteTable(
  'tokens',
  {
    id: text().primaryKey(),
    workflowRunId: text().notNull(),
    nodeId: text().notNull(),
    status: text().$type<TokenStatus>().notNull(),

    /** Lineage tracking */
    parentTokenId: text(),
    pathId: text().notNull(),

    /** Sibling group membership for fan-out coordination */
    siblingGroup: text(),

    /** Branch position (for fan-out siblings) */
    branchIndex: integer().notNull(),
    branchTotal: integer().notNull(),

    /** Loop iteration tracking - counts per transition ID for cycle control */
    iterationCounts: text({ mode: 'json' }).$type<Record<string, number>>(),

    /** Timestamps */
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
    arrivedAt: integer({ mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_tokens_workflow_run').on(table.workflowRunId),
    index('idx_tokens_status').on(table.status),
    index('idx_tokens_siblingGroup').on(table.siblingGroup),
    index('idx_tokens_path').on(table.pathId),
  ],
);

/**
 * Fan-in tracking for synchronization.
 */
export const fanIns = sqliteTable(
  'fan_ins',
  {
    id: text().primaryKey(),
    workflowRunId: text().notNull(),
    nodeId: text().notNull(),
    fanInPath: text().notNull(),
    status: text().$type<'waiting' | 'activated' | 'timed_out'>().notNull(),

    transitionId: text().notNull(),

    firstArrivalAt: integer({ mode: 'timestamp_ms' }).notNull(),
    activatedAt: integer({ mode: 'timestamp_ms' }),
    activatedByTokenId: text(),
  },
  (table) => [
    index('idx_fan_ins_workflow_run').on(table.workflowRunId),
    index('idx_fan_ins_path').on(table.fanInPath),
    index('idx_fan_ins_unique_path').on(table.workflowRunId, table.fanInPath),
  ],
);

/**
 * Workflow Status Table
 *
 * Single-row table tracking the workflow run's lifecycle status.
 * Used to guard against double finalization and track overall state.
 */
export const workflowStatus = sqliteTable('workflow_status', {
  workflowRunId: text().primaryKey(),
  status: text().$type<WorkflowStatus>().notNull(),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
});

/**
 * Subworkflows Table
 *
 * Tracks active subworkflows spawned by this workflow run.
 * Used for cascade cancellation when parent workflow fails/cancels.
 */
export const subworkflows = sqliteTable(
  'subworkflows',
  {
    id: text().primaryKey(),
    workflowRunId: text().notNull(), // Parent workflow run
    parentTokenId: text().notNull(), // Token waiting for this subworkflow
    subworkflowRunId: text().notNull(), // Subworkflow run ID
    status: text().$type<'running' | 'completed' | 'failed' | 'cancelled'>().notNull(),
    timeoutMs: integer(), // Optional timeout in milliseconds
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_subworkflows_workflow_run').on(table.workflowRunId),
    index('idx_subworkflows_parent_token').on(table.parentTokenId),
    index('idx_subworkflows_status').on(table.status),
  ],
);

// Legacy snake_case exports for backward compatibility during migration
export { fanIns as fan_ins, workflowStatus as workflow_status };
