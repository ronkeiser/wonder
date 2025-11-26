import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Logs table for Wonder logger package
 * Import and re-export from your service's schema.ts to include in migrations
 */
export const logs = sqliteTable(
  'logs',
  {
    id: text('id').primaryKey(),
    level: text('level').notNull(),
    event_type: text('event_type').notNull(),
    message: text('message'),
    metadata: text('metadata').notNull(), // JSON blob
    timestamp: integer('timestamp').notNull(),
  },
  (table) => [
    index('idx_logs_level').on(table.level),
    index('idx_logs_event_type').on(table.event_type),
    index('idx_logs_timestamp').on(table.timestamp),
  ],
);
