/**
 * Message Operations
 *
 * Drizzle-based operations for message storage.
 *
 * Messages are user or agent utterances within a conversation.
 * Each message belongs to a turn (the unit of agent work that produced it).
 */

import type { Emitter } from '@wonder/events';
import { desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { messages } from '../schema';
import type { MessageRole } from '../types';
import type { AgentDb } from './db';

/** Message row type inferred from schema */
export type MessageRow = typeof messages.$inferSelect;

/** Append message parameters */
export type AppendMessageParams = {
  conversationId: string;
  turnId: string;
  role: MessageRole;
  content: string;
};

/**
 * MessageManager handles message storage for conversations.
 *
 * Messages are the visible dialogue—what users and agents say to each other.
 * Each message is linked to a turn, enabling threading and context tracking.
 */
export class MessageManager {
  private readonly db: AgentDb;
  private readonly emitter: Emitter;

  constructor(db: AgentDb, emitter: Emitter) {
    this.db = db;
    this.emitter = emitter;
  }

  /**
   * Append a message to a turn.
   */
  append(params: AppendMessageParams): string {
    const messageId = ulid();
    const now = new Date();

    this.db
      .insert(messages)
      .values({
        id: messageId,
        conversationId: params.conversationId,
        turnId: params.turnId,
        role: params.role,
        content: params.content,
        createdAt: now,
      })
      .run();

    this.emitter.emitTrace({
      type: 'operation.messages.appended',
      payload: {
        messageId,
        conversationId: params.conversationId,
        turnId: params.turnId,
        role: params.role,
        contentLength: params.content.length,
      },
    });

    return messageId;
  }

  /**
   * Get message by ID.
   */
  get(messageId: string): MessageRow | null {
    const result = this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1)
      .all();

    return result[0] ?? null;
  }

  /**
   * Get messages for a turn (in creation order).
   */
  getForTurn(turnId: string): MessageRow[] {
    return this.db.select().from(messages).where(eq(messages.turnId, turnId)).all();
  }

  /**
   * Get recent messages for a conversation (most recent first).
   */
  getRecent(conversationId: string, limit: number): MessageRow[] {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .all();
  }

  /**
   * Get all messages for a conversation (in creation order).
   */
  getForConversation(conversationId: string): MessageRow[] {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .all();
  }
}
