/**
 * Test Helpers for Operations Tests
 *
 * Provides in-memory SQLite database setup for testing operations managers.
 * Uses better-sqlite3 with drizzle-orm/better-sqlite3 driver.
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from '../../src/schema';

export type TestDb = BetterSQLite3Database<typeof schema>;

/**
 * Migration SQL for test database.
 * Creates all tables defined in schema.
 */
const MIGRATION_SQL = `
  -- Turns table
  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    caller_type TEXT NOT NULL,
    caller_user_id TEXT,
    caller_run_id TEXT,
    caller_agent_id TEXT,
    caller_turn_id TEXT,
    input TEXT,
    reply_to_message_id TEXT,
    status TEXT NOT NULL,
    context_assembly_run_id TEXT,
    memory_extraction_run_id TEXT,
    memory_extraction_failed INTEGER,
    tool_failure_count INTEGER,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_turns_conversation ON turns(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_turns_status ON turns(status);

  -- Messages table
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_turn ON messages(turn_id);

  -- Moves table
  CREATE TABLE IF NOT EXISTS moves (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    reasoning TEXT,
    tool_call_id TEXT,
    tool_id TEXT,
    tool_input TEXT,
    tool_result TEXT,
    raw TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_moves_turn ON moves(turn_id);
  CREATE INDEX IF NOT EXISTS idx_moves_sequence ON moves(turn_id, sequence);

  -- Async ops table
  CREATE TABLE IF NOT EXISTS async_ops (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL,
    result TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_async_ops_turn ON async_ops(turn_id);
  CREATE INDEX IF NOT EXISTS idx_async_ops_status ON async_ops(status);
`;

/**
 * Create an in-memory test database with schema.
 */
export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:');
  sqlite.exec(MIGRATION_SQL);
  return drizzle(sqlite, { schema, casing: 'snake_case' });
}

/**
 * Mock emitter that captures trace events.
 */
export function createMockEmitter() {
  const events: Array<{ type: string; payload: unknown }> = [];

  return {
    events,
    emitTrace: (event: { type: string; payload: unknown }) => {
      events.push(event);
    },
    clear: () => {
      events.length = 0;
    },
  };
}
