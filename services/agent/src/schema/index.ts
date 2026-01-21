/**
 * Agent DO SQLite Schemas
 *
 * Tables for ConversationRunner state management:
 * - conversationMeta: Cached conversation metadata (single row)
 * - turns: Track agent work units
 * - messages: User and agent utterances
 * - moves: Iterations within a turn
 * - asyncOps: Pending async operations
 */

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  AsyncOpStatus,
  AsyncOpTargetType,
  BranchContext,
  ConversationStatus,
  MessageRole,
  Participant,
  TurnStatus,
} from '../types';

// Re-export types for consumers
export type {
  AsyncOpStatus,
  AsyncOpTargetType,
  BranchContext,
  ConversationStatus,
  MessageRole,
  Participant,
  TurnStatus,
} from '../types';

/**
 * Conversation metadata cached in DO SQLite.
 * Single row - loaded from D1 on first access, cached for DO lifetime.
 */
export const conversationMeta = sqliteTable('conversation_meta', {
  id: text().primaryKey(),
  agentId: text().notNull(),
  participants: text({ mode: 'json' }).$type<Participant[]>().notNull(),
  status: text().$type<ConversationStatus>().notNull(),
  /** Branch context for shell operations (created on first turn) */
  branchContext: text({ mode: 'json' }).$type<BranchContext>(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
});

/**
 * Agent definition cached in DO SQLite.
 * Single row - loaded from D1 on first access.
 */
export const agentDef = sqliteTable('agent_def', {
  id: text().primaryKey(),
  name: text().notNull(),
  projectIds: text({ mode: 'json' }).$type<string[]>().notNull(),
  personaId: text(),
  personaVersion: integer(),
});

/**
 * Persona definition cached in DO SQLite.
 * Single row - loaded from D1 on first access.
 */
export const personaDef = sqliteTable('persona_def', {
  id: text().notNull(),
  version: integer().notNull(),
  name: text().notNull(),
  systemPrompt: text().notNull(),
  modelProfileId: text().notNull(),
  contextAssemblyWorkflowDefId: text().notNull(),
  memoryExtractionWorkflowDefId: text().notNull(),
  recentTurnsLimit: integer().notNull(),
  toolIds: text({ mode: 'json' }).$type<string[]>().notNull(),
  constraints: text({ mode: 'json' }).$type<{ maxMovesPerTurn?: number }>(),
});

/**
 * Tool definitions cached in DO SQLite.
 * Multiple rows - loaded from D1 based on persona.toolIds.
 */
export const toolDefs = sqliteTable('tool_defs', {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull(),
  inputSchema: text({ mode: 'json' }).$type<object>().notNull(),
  targetType: text().$type<'task' | 'workflow' | 'agent'>().notNull(),
  targetId: text().notNull(),
  async: integer({ mode: 'boolean' }).notNull(),
  invocationMode: text().$type<'delegate' | 'loop_in'>(),
  inputMapping: text({ mode: 'json' }).$type<Record<string, string>>(),
});

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

    // Raw LLM response content blocks (for tool continuation)
    // Stores the full assistant content array so we can reconstruct
    // the assistant message with tool_use blocks for continuation
    rawContent: text({ mode: 'json' }).$type<unknown[]>(),

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
 * Participants in a conversation.
 *
 * Tracks who has access to a conversation - users and agents.
 * For loop-in mode, the target agent is added as a participant.
 */
export const participants = sqliteTable(
  'participants',
  {
    id: text().primaryKey(),
    conversationId: text().notNull(),
    participantType: text().$type<'user' | 'agent'>().notNull(),
    participantId: text().notNull(), // userId or agentId
    addedAt: integer({ mode: 'timestamp_ms' }).notNull(),
    addedByTurnId: text(), // Which turn added this participant (for loop-in tracking)
  },
  (table) => [
    index('idx_participants_conversation').on(table.conversationId),
    index('idx_participants_type').on(table.participantType),
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
    /** When this operation should timeout (for alarm scheduling) */
    timeoutAt: integer({ mode: 'timestamp_ms' }),

    // Retry tracking
    /** Current attempt number (1-based) */
    attemptNumber: integer().default(1),
    /** Maximum attempts allowed */
    maxAttempts: integer().default(1),
    /** Backoff delay in ms between retries */
    backoffMs: integer(),
    /** Last error message (for retry debugging) */
    lastError: text(),
  },
  (table) => [
    index('idx_async_ops_turn').on(table.turnId),
    index('idx_async_ops_status').on(table.status),
    index('idx_async_ops_timeout').on(table.timeoutAt),
  ],
);
