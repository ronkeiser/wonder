import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Events table for workflow execution tracking
 *
 * Schema optimized for execution observability:
 * - workflow_run_id: primary execution context
 * - parent_run_id: track sub-workflow hierarchy
 * - node_id: which node in the workflow graph
 * - token_id: which token (for parallel execution tracking)
 * - path_id: execution path for tracing
 * - sequence_number: total ordering for replay
 * - workspace_id/project_id: tenant filtering
 * - cost_usd/tokens: LLM cost tracking
 */
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    timestamp: integer('timestamp').notNull(),
    sequence_number: integer('sequence_number').notNull(), // For replay ordering
    event_type: text('event_type').notNull(),

    // Execution context
    workflow_run_id: text('workflow_run_id').notNull(),
    parent_run_id: text('parent_run_id'), // For sub-workflows
    workflow_def_id: text('workflow_def_id'),
    node_id: text('node_id'),
    token_id: text('token_id'),
    path_id: text('path_id'), // Execution path tracing

    // Tenant context
    workspace_id: text('workspace_id').notNull(),
    project_id: text('project_id').notNull(),

    // Cost tracking (for LLM calls)
    tokens: integer('tokens'),
    cost_usd: real('cost_usd'),

    // Event payload
    message: text('message'),
    metadata: text('metadata').notNull(), // JSON blob with event-specific data
  },
  (table) => [
    index('idx_events_timestamp').on(table.timestamp),
    index('idx_events_event_type').on(table.event_type),
    index('idx_events_workflow_run_id').on(table.workflow_run_id),
    index('idx_events_parent_run_id').on(table.parent_run_id),
    index('idx_events_workspace_id').on(table.workspace_id),
    index('idx_events_project_id').on(table.project_id),
    index('idx_events_node_id').on(table.node_id),
    index('idx_events_sequence').on(table.workflow_run_id, table.sequence_number),
  ],
);
