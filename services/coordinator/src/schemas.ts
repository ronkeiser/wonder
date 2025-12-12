/**
 * Coordinator Internal Schemas
 *
 * These schemas are internal to the coordinator DO and are NOT exported.
 * They define execution state that lives only in DO SQLite.
 */

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Token Status
 *
 * pending → dispatched → executing → completed/failed/timed_out/cancelled
 */
export type TokenStatus =
  | 'pending'
  | 'dispatched'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'waiting_for_siblings';

/**
 * Tokens track execution position within a workflow run.
 *
 * Fan-out creates multiple tokens (siblings sharing fan_out_transition_id).
 * Fan-in merges tokens back together.
 */
export const tokens = sqliteTable(
  'tokens',
  {
    id: text('id').primaryKey(),
    workflowRunId: text('workflow_run_id').notNull(),
    nodeId: text('node_id').notNull(),
    status: text('status').$type<TokenStatus>().notNull(),

    // Lineage tracking
    parentTokenId: text('parent_token_id'),
    pathId: text('path_id').notNull(),
    fanOutTransitionId: text('fan_out_transition_id'),

    // Branch position (for fan-out siblings)
    branchIndex: integer('branch_index').notNull(),
    branchTotal: integer('branch_total').notNull(),

    // Timestamps
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    arrivedAt: integer('arrived_at', { mode: 'timestamp_ms' }), // For synchronization timeout tracking
  },
  (table) => [
    index('idx_tokens_workflow_run').on(table.workflowRunId),
    index('idx_tokens_status').on(table.status),
    index('idx_tokens_fan_out').on(table.fanOutTransitionId),
    index('idx_tokens_path').on(table.pathId),
  ],
);

/**
 * Fan-in tracking for synchronization.
 *
 * Created when first sibling arrives at a synchronization point.
 * Activated when synchronization condition is met.
 */
export const fanIns = sqliteTable(
  'fan_ins',
  {
    id: text('id').primaryKey(),
    workflowRunId: text('workflow_run_id').notNull(),
    nodeId: text('node_id').notNull(),
    fanInPath: text('fan_in_path').notNull(), // Stable path for this fan-in point
    status: text('status').$type<'waiting' | 'activated' | 'timed_out'>().notNull(),

    // The transition that defines synchronization behavior
    transitionId: text('transition_id').notNull(),

    // Tracking
    firstArrivalAt: integer('first_arrival_at', { mode: 'timestamp_ms' }).notNull(),
    activatedAt: integer('activated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_fan_ins_workflow_run').on(table.workflowRunId),
    index('idx_fan_ins_path').on(table.fanInPath),
  ],
);
