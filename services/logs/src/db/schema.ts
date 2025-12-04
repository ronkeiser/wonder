import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Logs table for operational logging
 *
 * Schema optimized for production debugging:
 * - environment: filter by prod/staging/dev
 * - service: which worker service emitted the log
 * - source_location: exact file:line (injected at build time)
 * - trace_id: distributed tracing across service boundaries
 * - request_id: correlate all logs for a single HTTP request
 * - tenant columns: filter by workspace/project/user
 * - version: deployment tracking (git sha or version)
 * - instance_id: specific DO instance for DO-specific issues
 */
export const logs = sqliteTable(
  'logs',
  {
    id: text('id').primaryKey(),
    timestamp: integer('timestamp').notNull(),
    level: text('level').notNull(),
    service: text('service').notNull(),
    environment: text('environment').notNull(),
    event_type: text('event_type'),
    message: text('message'),
    source_location: text('source_location'), // 'coordinator.ts:142'
    trace_id: text('trace_id'),
    request_id: text('request_id'),
    workspace_id: text('workspace_id'),
    project_id: text('project_id'),
    user_id: text('user_id'),
    version: text('version'),
    instance_id: text('instance_id'),
    highlight: text('highlight'), // Optional color for visual emphasis (1-10)
    metadata: text('metadata').notNull(), // JSON blob
  },
  (table) => [
    index('idx_logs_timestamp').on(table.timestamp),
    index('idx_logs_level').on(table.level),
    index('idx_logs_service').on(table.service),
    index('idx_logs_environment').on(table.environment),
    index('idx_logs_event_type').on(table.event_type),
    index('idx_logs_trace_id').on(table.trace_id),
    index('idx_logs_request_id').on(table.request_id),
    index('idx_logs_workspace_id').on(table.workspace_id),
  ],
);
