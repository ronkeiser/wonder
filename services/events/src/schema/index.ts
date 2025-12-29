import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Execution events table for unified event tracking
 *
 * Generic schema supporting multiple execution contexts (workflows, conversations, etc.):
 * - streamId: outer execution boundary (conversationId or rootRunId)
 * - executionId: specific execution (workflowRunId, turnId, etc.)
 * - executionType: discriminator for event domain
 * - sequence: per-stream ordering for replay
 * - projectId: tenant filtering
 * - metadata: domain-specific fields (nodeId, tokenId, costUsd, etc.)
 */
export const events = sqliteTable(
  'events',
  {
    id: text().primaryKey(),
    timestamp: integer().notNull(),
    sequence: integer().notNull(), // For replay ordering

    // Generic execution context
    streamId: text().notNull(), // Outer boundary (conversationId or rootRunId)
    executionId: text().notNull(), // Specific execution (workflowRunId, turnId, etc.)
    executionType: text().notNull(), // 'workflow' | 'conversation' | ...

    // Event classification
    eventType: text().notNull(),

    // Tenant context
    projectId: text().notNull(),

    // Event payload
    message: text(),
    metadata: text().notNull(), // JSON blob with all domain-specific data
  },
  (table) => [
    index('idx_events_timestamp').on(table.timestamp),
    index('idx_events_event_type').on(table.eventType),
    index('idx_events_stream_id').on(table.streamId),
    index('idx_events_execution_id').on(table.executionId),
    index('idx_events_execution_type').on(table.executionType),
    index('idx_events_project_id').on(table.projectId),
    index('idx_events_sequence').on(table.streamId, table.sequence),
  ],
);

/**
 * Trace events table for execution debugging
 *
 * Schema optimized for line-by-line execution visibility:
 * - sequence: per-stream ordered execution trace
 * - category: fast filtering by layer (decision/operation/dispatch/sql)
 * - durationMs: performance profiling and alerting
 * - payload: all domain-specific context (tokenId, nodeId, etc.)
 *
 * Note: Opt-in per execution via header or env var
 */
export const traceEvents = sqliteTable(
  'trace_events',
  {
    id: text().primaryKey(),

    // Ordering & timing
    sequence: integer().notNull(),
    timestamp: integer().notNull(),

    // Generic execution context
    streamId: text().notNull(), // Outer boundary (conversationId or rootRunId)
    executionId: text().notNull(), // Specific execution (workflowRunId, turnId, etc.)
    executionType: text().notNull(), // 'workflow' | 'conversation' | ...

    // Event classification
    type: text().notNull(), // 'decision.routing.start', 'operation.context.read', etc.
    category: text().notNull(), // 'decision', 'operation', 'dispatch', 'sql'

    // Tenant context
    projectId: text().notNull(),

    // Performance tracking
    durationMs: real(), // For SQL queries, operation timing

    // Payload (structured data specific to event type, includes tokenId, nodeId, etc.)
    payload: text().notNull(),

    // Human-readable message (optional, for UI display)
    message: text(),
  },
  (table) => [
    index('idx_trace_events_stream_sequence').on(table.streamId, table.sequence),
    index('idx_trace_events_execution_id').on(table.executionId),
    index('idx_trace_events_execution_type').on(table.executionType),
    index('idx_trace_events_type').on(table.type),
    index('idx_trace_events_category').on(table.category),
    index('idx_trace_events_project').on(table.projectId, table.timestamp),
    index('idx_trace_events_duration').on(table.durationMs),
  ],
);
