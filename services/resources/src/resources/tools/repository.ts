/** Repository for tool data access */

import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { tools } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Tool } from './types';

type NewTool = NewEntity<typeof tools.$inferInsert>;

export async function createTool(db: DrizzleD1Database, data: NewTool): Promise<Tool> {
  const now = new Date().toISOString();
  const [tool] = await db
    .insert(tools)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return tool;
}

export async function getTool(db: DrizzleD1Database, id: string): Promise<Tool | null> {
  const result = await db.select().from(tools).where(eq(tools.id, id)).get();
  return result ?? null;
}

export async function listTools(db: DrizzleD1Database, limit: number = 100): Promise<Tool[]> {
  return await db.select().from(tools).limit(limit).all();
}

export async function listToolsByLibrary(
  db: DrizzleD1Database,
  libraryId: string,
  limit: number = 100,
): Promise<Tool[]> {
  return await db.select().from(tools).where(eq(tools.libraryId, libraryId)).limit(limit).all();
}

export async function listToolsByIds(db: DrizzleD1Database, ids: string[]): Promise<Tool[]> {
  if (ids.length === 0) return [];

  // Use individual queries and combine (D1 doesn't support IN with dynamic arrays well)
  const results: Tool[] = [];
  for (const id of ids) {
    const tool = await getTool(db, id);
    if (tool) results.push(tool);
  }
  return results;
}

export async function deleteTool(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(tools).where(eq(tools.id, id)).run();
}

export async function updateTool(
  db: DrizzleD1Database,
  id: string,
  data: Partial<NewTool>,
): Promise<Tool | null> {
  const now = new Date().toISOString();
  const [updated] = await db
    .update(tools)
    .set({ ...data, updatedAt: now })
    .where(eq(tools.id, id))
    .returning();
  return updated ?? null;
}

export async function getToolByName(
  db: DrizzleD1Database,
  name: string,
  libraryId: string | null,
): Promise<Tool | null> {
  const result = await db
    .select()
    .from(tools)
    .where(
      and(
        eq(tools.name, name),
        libraryId ? eq(tools.libraryId, libraryId) : isNull(tools.libraryId),
      ),
    )
    .get();
  return result ?? null;
}
