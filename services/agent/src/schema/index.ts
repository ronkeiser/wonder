/**
 * Agent DO SQLite Schemas
 *
 * Tables for ConversationDO state management:
 * - turns: Track agent work units
 * - messages: User and agent utterances
 * - moves: Iterations within a turn
 * - asyncOps: Pending async operations
 */

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AsyncOpStatus, AsyncOpTargetType, MessageRole, TurnStatus } from '../types';

// Re-export types for consumers
export type { AsyncOpStatus, AsyncOpTargetType, MessageRole, TurnStatus } from '../types';

/**
 * Turns track one unit of agent work within a conversation.
 */
export const turns = sqliteTable(
  'turns',
  {
    id: text().primaryKey(),
    conversationId: text().notNull(),

    // Who initiated this turn (discriminated union flattened)
    callerType: text().$type<'user' | 'workflow' | 'agent'>().notNull(),
    callerUserId: text(), // if callerType === 'user'
    callerRunId: text(), // if callerType === 'workflow'
    callerAgentId: text(), // if callerType === 'agent'
    callerTurnId: text(), // if callerType === 'agent'

    input: text({ mode: 'json' }),
    replyToMessageId: text(),

    status: text().$type<TurnStatus>().notNull(),

    // Linked workflow runs
    contextAssemblyRunId: text(),
    memoryExtractionRunId: text(),

    // Issues (set on completion)
    memoryExtractionFailed: integer({ mode: 'boolean' }),
    toolFailureCount: integer(),

    // Timestamps
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    completedAt: integer({ mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_turns_conversation').on(table.conversationId),
    index('idx_turns_status').on(table.status),
  ],
);

/**
 * Messages are user or agent utterances.
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text().primaryKey(),
    conversationId: text().notNull(),
    turnId: text().notNull(),
    role: text().$type<MessageRole>().notNull(),
    content: text().notNull(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId),
    index('idx_messages_turn').on(table.turnId),
  ],
);

/**
 * Moves record each iteration within a turn.
 */
export const moves = sqliteTable(
  'moves',
  {
    id: text().primaryKey(),
    turnId: text().notNull(),
    sequence: integer().notNull(),

    // What happened
    reasoning: text(), // LLM text output
    toolCallId: text(),
    toolId: text(),
    toolInput: text({ mode: 'json' }),
    toolResult: text({ mode: 'json' }),

    // Debug
    raw: text(),

    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_moves_turn').on(table.turnId),
    index('idx_moves_sequence').on(table.turnId, table.sequence),
  ],
);

/**
 * Async operations pending on a turn.
 */
export const asyncOps = sqliteTable(
  'async_ops',
  {
    id: text().primaryKey(),
    turnId: text().notNull(),
    targetType: text().$type<AsyncOpTargetType>().notNull(),
    targetId: text().notNull(),
    status: text().$type<AsyncOpStatus>().notNull(),
    result: text({ mode: 'json' }),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    completedAt: integer({ mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_async_ops_turn').on(table.turnId),
    index('idx_async_ops_status').on(table.status),
  ],
);
