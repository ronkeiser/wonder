import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Workflow events table for workflow execution tracking
 *
 * Schema optimized for execution observability:
 * - workflowRunId: primary execution context
 * - parentRunId: track sub-workflow hierarchy
 * - nodeId: which node in the workflow graph
 * - tokenId: which token (for parallel execution tracking)
 * - pathId: execution path for tracing
 * - sequence: total ordering for replay
 * - projectId: tenant filtering
 * - costUsd/tokens: LLM cost tracking
 */
export const workflowEvents = sqliteTable(
  'workflow_events',
  {
    id: text().primaryKey(),
    timestamp: integer().notNull(),
    sequence: integer().notNull(), // For replay ordering
    eventType: text().notNull(),

    // Execution context
    workflowRunId: text().notNull(),
    rootRunId: text().notNull(), // Top-level run ID for unified timeline queries
    workflowDefId: text().notNull(),
    nodeId: text(),
    tokenId: text(),
    pathId: text(), // Execution path tracing

    // Tenant context
    projectId: text().notNull(),

    // Cost tracking (for LLM calls)
    tokens: integer(),
    costUsd: real(),

    // Event payload
    message: text(),
    metadata: text().notNull(), // JSON blob with event-specific data
  },
  (table) => [
    index('idx_events_timestamp').on(table.timestamp),
    index('idx_events_event_type').on(table.eventType),
    index('idx_events_workflow_run_id').on(table.workflowRunId),
    index('idx_events_root_run_id').on(table.rootRunId),
    index('idx_events_project_id').on(table.projectId),
    index('idx_events_node_id').on(table.nodeId),
    index('idx_events_token_id').on(table.tokenId),
    index('idx_events_sequence').on(table.workflowRunId, table.sequence),
  ],
);

/**
 * Trace events table for coordinator execution debugging
 *
 * Schema optimized for line-by-line execution visibility:
 * - sequence: per-workflow ordered execution trace
 * - category: fast filtering by layer (decision/operation/dispatch/sql)
 * - tokenId/nodeId: execution context for path tracing
 * - projectId: tenant isolation
 * - durationMs: performance profiling and alerting
 *
 * Note: Opt-in per workflow run via header or env var
 */
export const traceEvents = sqliteTable(
  'trace_events',
  {
    id: text().primaryKey(),

    // Ordering & timing
    sequence: integer().notNull(),
    timestamp: integer().notNull(),

    // Event classification
    type: text().notNull(), // 'decision.routing.start', 'operation.context.read', etc.
    category: text().notNull(), // 'decision', 'operation', 'dispatch', 'sql'

    // Execution context
    workflowRunId: text().notNull(),
    rootRunId: text().notNull(), // Top-level run ID for unified timeline queries
    tokenId: text(), // Most events relate to specific token
    nodeId: text(), // Many events happen at specific node

    // Tenant context
    projectId: text().notNull(),

    // Performance tracking
    durationMs: real(), // For SQL queries, operation timing

    // Payload (structured data specific to event type)
    payload: text().notNull(),

    // Human-readable message (optional, for UI display)
    message: text(),
  },
  (table) => [
    index('idx_trace_events_workflow_sequence').on(table.workflowRunId, table.sequence),
    index('idx_trace_events_root_run_id').on(table.rootRunId),
    index('idx_trace_events_type').on(table.type),
    index('idx_trace_events_category').on(table.category),
    index('idx_trace_events_token').on(table.tokenId),
    index('idx_trace_events_project').on(table.projectId, table.timestamp),
    index('idx_trace_events_duration').on(table.durationMs),
  ],
);
