/** Repository for workspace data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { workspaces } from '~/infrastructure/db/schema';

type Workspace = typeof workspaces.$inferSelect;
type NewWorkspace = Omit<typeof workspaces.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

export async function createWorkspace(
  db: DrizzleD1Database,
  data: NewWorkspace,
): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: ulid(),
    name: data.name,
    settings: data.settings ?? null,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workspaces).values(workspace).run();
  return workspace;
}

export async function getWorkspace(db: DrizzleD1Database, id: string): Promise<Workspace | null> {
  const result = await db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  return result ?? null;
}

export async function listWorkspaces(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<Workspace[]> {
  return await db.select().from(workspaces).limit(limit).all();
}

export async function updateWorkspace(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<NewWorkspace, 'name' | 'settings'>>,
): Promise<Workspace | null> {
  const now = new Date().toISOString();

  await db
    .update(workspaces)
    .set({
      ...data,
      updated_at: now,
    })
    .where(eq(workspaces.id, id))
    .run();

  return await getWorkspace(db, id);
}

export async function deleteWorkspace(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id)).run();
}
