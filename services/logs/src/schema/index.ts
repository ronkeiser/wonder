import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Logs table for operational logging
 *
 * Schema optimized for production debugging:
 * - environment: filter by prod/staging/dev
 * - service: which worker service emitted the log
 * - sourceLocation: exact file:line (injected at build time)
 * - traceId: distributed tracing across service boundaries
 * - requestId: correlate all logs for a single HTTP request
 * - tenant columns: filter by workspace/project/user
 * - version: deployment tracking (git sha or version)
 * - instanceId: specific DO instance for DO-specific issues
 */
export const logs = sqliteTable(
  'logs',
  {
    id: text().primaryKey(),
    timestamp: real().notNull(), // High-precision timestamp with microseconds
    level: text().notNull(),
    service: text().notNull(),
    environment: text().notNull(),
    eventType: text(),
    message: text(),
    sourceLocation: text(), // 'coordinator.ts:142'
    traceId: text(),
    requestId: text(),
    workspaceId: text(),
    projectId: text(),
    userId: text(),
    version: text(),
    instanceId: text(),
    highlight: text(), // Optional color for visual emphasis (1-10)
    metadata: text().notNull(), // JSON blob
  },
  (table) => [
    index('idx_logs_timestamp').on(table.timestamp),
    index('idx_logs_level').on(table.level),
    index('idx_logs_service').on(table.service),
    index('idx_logs_environment').on(table.environment),
    index('idx_logs_event_type').on(table.eventType),
    index('idx_logs_trace_id').on(table.traceId),
    index('idx_logs_request_id').on(table.requestId),
    index('idx_logs_workspace_id').on(table.workspaceId),
  ],
);
