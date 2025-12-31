/** Repository for message data access in D1 */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { messages } from '../../schema';
import type { Message, MessageRole } from './types';

export type CreateMessageParams = {
  id: string;
  conversationId: string;
  turnId: string;
  role: MessageRole;
  content: string;
};

export async function createMessage(
  db: DrizzleD1Database,
  params: CreateMessageParams,
): Promise<Message> {
  const now = new Date().toISOString();

  const [message] = await db
    .insert(messages)
    .values({
      id: params.id,
      conversationId: params.conversationId,
      turnId: params.turnId,
      role: params.role,
      content: params.content,
      createdAt: now,
    })
    .returning();

  return message;
}

export async function getMessage(
  db: DrizzleD1Database,
  id: string,
): Promise<Message | null> {
  const result = await db.select().from(messages).where(eq(messages.id, id)).get();
  return result ?? null;
}

export async function listMessagesForConversation(
  db: DrizzleD1Database,
  conversationId: string,
  limit: number = 100,
): Promise<Message[]> {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .limit(limit)
    .all();
}

export async function listMessagesForTurn(
  db: DrizzleD1Database,
  turnId: string,
): Promise<Message[]> {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.turnId, turnId))
    .all();
}

export async function deleteMessage(
  db: DrizzleD1Database,
  id: string,
): Promise<void> {
  await db.delete(messages).where(eq(messages.id, id)).run();
}
