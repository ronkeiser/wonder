/** Repository for agent data access */

import { desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { agents } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Agent } from './types';

type NewAgent = NewEntity<typeof agents.$inferInsert>;

export async function createAgent(db: DrizzleD1Database, data: NewAgent): Promise<Agent> {
  const now = new Date().toISOString();
  const [agent] = await db
    .insert(agents)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return agent;
}

export async function getAgent(db: DrizzleD1Database, id: string): Promise<Agent | null> {
  const result = await db.select().from(agents).where(eq(agents.id, id)).get();
  return result ?? null;
}

export async function listAgents(db: DrizzleD1Database, limit: number = 100): Promise<Agent[]> {
  return await db.select().from(agents).orderBy(desc(agents.createdAt)).limit(limit).all();
}

export async function deleteAgent(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(agents).where(eq(agents.id, id)).run();
}

export async function updateAgent(
  db: DrizzleD1Database,
  id: string,
  data: Partial<NewAgent>,
): Promise<Agent | null> {
  const now = new Date().toISOString();
  const [updated] = await db
    .update(agents)
    .set({ ...data, updatedAt: now })
    .where(eq(agents.id, id))
    .returning();
  return updated ?? null;
}
