/** Repository for conversation data access */

import { desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { conversations } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Conversation, ConversationStatus } from './types';

type NewConversation = NewEntity<typeof conversations.$inferInsert>;

export async function createConversation(
  db: DrizzleD1Database,
  data: NewConversation,
): Promise<Conversation> {
  const now = new Date().toISOString();
  const [conversation] = await db
    .insert(conversations)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return conversation;
}

export async function getConversation(
  db: DrizzleD1Database,
  id: string,
): Promise<Conversation | null> {
  const result = await db.select().from(conversations).where(eq(conversations.id, id)).get();
  return result ?? null;
}

export async function listConversations(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<Conversation[]> {
  return await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt))
    .limit(limit)
    .all();
}

export async function listConversationsByStatus(
  db: DrizzleD1Database,
  status: ConversationStatus,
  limit: number = 100,
): Promise<Conversation[]> {
  return await db
    .select()
    .from(conversations)
    .where(eq(conversations.status, status))
    .orderBy(desc(conversations.createdAt))
    .limit(limit)
    .all();
}

export async function deleteConversation(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, id)).run();
}

export async function updateConversationStatus(
  db: DrizzleD1Database,
  id: string,
  status: ConversationStatus,
): Promise<Conversation | null> {
  const now = new Date().toISOString();
  const [updated] = await db
    .update(conversations)
    .set({ status, updatedAt: now })
    .where(eq(conversations.id, id))
    .returning();
  return updated ?? null;
}

export async function listConversationsByAgentId(
  db: DrizzleD1Database,
  agentId: string,
  limit: number = 100,
): Promise<Conversation[]> {
  // SQLite JSON querying: participants is a JSON array, we need to find conversations
  // where at least one participant has type='agent' and agentId matching our target
  const all = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt))
    .all();

  // Filter in application layer since D1 SQLite JSON querying is limited
  return all
    .filter((c) =>
      c.participants.some(
        (p) => p.type === 'agent' && p.agentId === agentId,
      ),
    )
    .slice(0, limit);
}
