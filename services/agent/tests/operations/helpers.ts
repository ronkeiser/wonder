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
    raw_content TEXT,
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
    completed_at INTEGER,
    timeout_at INTEGER,
    attempt_number INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 1,
    backoff_ms INTEGER,
    last_error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_async_ops_turn ON async_ops(turn_id);
  CREATE INDEX IF NOT EXISTS idx_async_ops_status ON async_ops(status);
  CREATE INDEX IF NOT EXISTS idx_async_ops_timeout ON async_ops(timeout_at);

  -- Conversation meta table
  CREATE TABLE IF NOT EXISTS conversation_meta (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    participants TEXT NOT NULL,
    status TEXT NOT NULL,
    branch_context TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Agent def table
  CREATE TABLE IF NOT EXISTS agent_def (
    id TEXT PRIMARY KEY,
    project_ids TEXT NOT NULL,
    persona_id TEXT,
    persona_version INTEGER
  );

  -- Persona def table
  CREATE TABLE IF NOT EXISTS persona_def (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    model_profile_id TEXT NOT NULL,
    context_assembly_workflow_id TEXT NOT NULL,
    memory_extraction_workflow_id TEXT NOT NULL,
    recent_turns_limit INTEGER NOT NULL,
    tool_ids TEXT NOT NULL,
    constraints TEXT
  );

  -- Tool defs table
  CREATE TABLE IF NOT EXISTS tool_defs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    input_schema TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    async INTEGER NOT NULL,
    invocation_mode TEXT,
    input_mapping TEXT
  );

  -- Participants table
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    added_by_turn_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_participants_conversation ON participants(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_participants_type ON participants(participant_type);
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
