/**
 * Coordinator DO SQLite Schemas
 *
 * Two categories:
 * 1. Definition tables - imported from @wonder/resources/schemas
 * 2. Execution tables - internal coordinator state (tokens, fan_ins)
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
export { nodes, transitions, workflow_defs, workflow_runs } from '@wonder/resources/schemas';

/**
 * Execution tables (internal coordinator state)
 */

/**
 * Tokens track execution position within a workflow run.
 */
export const tokens = sqliteTable(
  'tokens',
  {
    id: text('id').primaryKey(),
    workflow_run_id: text('workflow_run_id').notNull(),
    node_id: text('node_id').notNull(),
    status: text('status').$type<TokenStatus>().notNull(),

    /** Lineage tracking */
    parent_token_id: text('parent_token_id'),
    path_id: text('path_id').notNull(),

    /** Sibling group membership for fan-out coordination */
    sibling_group: text('sibling_group'),

    /** Branch position (for fan-out siblings) */
    branch_index: integer('branch_index').notNull(),
    branch_total: integer('branch_total').notNull(),

    /** Loop iteration tracking - counts per transition ID for cycle control */
    iteration_counts: text('iteration_counts', { mode: 'json' }).$type<Record<string, number>>(),

    /** Timestamps */
    created_at: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    arrived_at: integer('arrived_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_tokens_workflow_run').on(table.workflow_run_id),
    index('idx_tokens_status').on(table.status),
    index('idx_tokens_sibling_group').on(table.sibling_group),
    index('idx_tokens_path').on(table.path_id),
  ],
);

/**
 * Fan-in tracking for synchronization.
 */
export const fan_ins = sqliteTable(
  'fan_ins',
  {
    id: text('id').primaryKey(),
    workflow_run_id: text('workflow_run_id').notNull(),
    node_id: text('node_id').notNull(),
    fan_in_path: text('fan_in_path').notNull(),
    status: text('status').$type<'waiting' | 'activated' | 'timed_out'>().notNull(),

    transition_id: text('transition_id').notNull(),

    first_arrival_at: integer('first_arrival_at', { mode: 'timestamp_ms' }).notNull(),
    activated_at: integer('activated_at', { mode: 'timestamp_ms' }),
    activated_by_token_id: text('activated_by_token_id'),
  },
  (table) => [
    index('idx_fan_ins_workflow_run').on(table.workflow_run_id),
    index('idx_fan_ins_path').on(table.fan_in_path),
    index('idx_fan_ins_unique_path').on(table.workflow_run_id, table.fan_in_path),
  ],
);

/**
 * Workflow Status Table
 *
 * Single-row table tracking the workflow run's lifecycle status.
 * Used to guard against double finalization and track overall state.
 */
export const workflow_status = sqliteTable('workflow_status', {
  workflow_run_id: text('workflow_run_id').primaryKey(),
  status: text('status').$type<WorkflowStatus>().notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
