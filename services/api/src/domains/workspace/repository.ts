/** Repository for workspace domain entities */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { projects, workspaces } from '~/infrastructure/db/schema';

type Workspace = typeof workspaces.$inferSelect;
type NewWorkspace = Omit<typeof workspaces.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

type Project = typeof projects.$inferSelect;
type NewProject = Omit<typeof projects.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

/** Workspace */

export async function createWorkspace(
  db: DrizzleD1Database,
  data: NewWorkspace,
): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspace = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workspaces).values(workspace).run();
  return workspace as Workspace;
}

export async function getWorkspace(db: DrizzleD1Database, id: string): Promise<Workspace | null> {
  const result = await db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  return result ?? null;
}

export async function listWorkspaces(
  db: DrizzleD1Database,
  options?: { limit?: number; offset?: number },
): Promise<Workspace[]> {
  let query = db.select().from(workspaces);

  if (options?.limit) {
    query = query.limit(options.limit) as any;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as any;
  }

  return await query.all();
}

export async function updateWorkspace(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<NewWorkspace, 'name' | 'settings'>>,
): Promise<Workspace> {
  const now = new Date().toISOString();

  await db
    .update(workspaces)
    .set({
      ...data,
      updated_at: now,
    })
    .where(eq(workspaces.id, id))
    .run();

  const updated = await getWorkspace(db, id);
  if (!updated) {
    throw new Error(`Workspace not found after update: ${id}`);
  }
  return updated;
}

export async function deleteWorkspace(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id)).run();
}

/** Project */

export async function createProject(db: DrizzleD1Database, data: NewProject): Promise<Project> {
  const now = new Date().toISOString();
  const project = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(projects).values(project).run();
  return project as Project;
}

export async function getProject(db: DrizzleD1Database, id: string): Promise<Project | null> {
  const result = await db.select().from(projects).where(eq(projects.id, id)).get();
  return result ?? null;
}

export async function deleteProject(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id)).run();
}
