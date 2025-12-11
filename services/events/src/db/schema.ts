import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Workflow events table for workflow execution tracking
 *
 * Schema optimized for execution observability:
 * - workflow_run_id: primary execution context
 * - parent_run_id: track sub-workflow hierarchy
 * - node_id: which node in the workflow graph
 * - token_id: which token (for parallel execution tracking)
 * - path_id: execution path for tracing
 * - sequence: total ordering for replay
 * - workspace_id/project_id: tenant filtering
 * - cost_usd/tokens: LLM cost tracking
 */
export const workflowEvents = sqliteTable(
  'workflow_events',
  {
    id: text('id').primaryKey(),
    timestamp: integer('timestamp').notNull(),
    sequence: integer('sequence').notNull(), // For replay ordering
    event_type: text('event_type').notNull(),

    // Execution context
    workflow_run_id: text('workflow_run_id').notNull(),
    parent_run_id: text('parent_run_id'), // For sub-workflows
    workflow_def_id: text('workflow_def_id').notNull(),
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
    index('idx_events_token_id').on(table.token_id),
    index('idx_events_sequence').on(table.workflow_run_id, table.sequence),
  ],
);

/**
 * Trace events table for coordinator execution debugging
 *
 * Schema optimized for line-by-line execution visibility:
 * - sequence: per-workflow ordered execution trace
 * - category: fast filtering by layer (decision/operation/dispatch/sql)
 * - token_id/node_id: execution context for path tracing
 * - workspace_id/project_id: tenant isolation
 * - duration_ms: performance profiling and alerting
 *
 * Note: Opt-in per workflow run via header or env var
 */
export const traceEvents = sqliteTable(
  'trace_events',
  {
    id: text('id').primaryKey(),

    // Ordering & timing
    sequence: integer('sequence').notNull(),
    timestamp: integer('timestamp').notNull(),

    // Event classification
    type: text('type').notNull(), // 'decision.routing.start', 'operation.context.read', etc.
    category: text('category').notNull(), // 'decision', 'operation', 'dispatch', 'sql'

    // Execution context
    workflow_run_id: text('workflow_run_id').notNull(),
    token_id: text('token_id'), // Most events relate to specific token
    node_id: text('node_id'), // Many events happen at specific node

    // Tenant context (multi-workspace isolation & billing attribution)
    workspace_id: text('workspace_id').notNull(),
    project_id: text('project_id').notNull(),

    // Performance tracking
    duration_ms: real('duration_ms'), // For SQL queries, operation timing

    // Payload (structured data specific to event type)
    payload: text('payload').notNull(), // JSON string - parsed manually in service
  },
  (table) => [
    index('idx_trace_events_workflow_sequence').on(table.workflow_run_id, table.sequence),
    index('idx_trace_events_type').on(table.type),
    index('idx_trace_events_category').on(table.category),
    index('idx_trace_events_token').on(table.token_id),
    index('idx_trace_events_workspace').on(table.workspace_id, table.timestamp),
    index('idx_trace_events_duration').on(table.duration_ms),
  ],
);
