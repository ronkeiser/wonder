/** Repository for project data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { projects } from '~/infrastructure/db/schema';

type Project = typeof projects.$inferSelect;
type NewProject = Omit<typeof projects.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

export async function createProject(db: DrizzleD1Database, data: NewProject): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: ulid(),
    workspace_id: data.workspace_id,
    name: data.name,
    description: data.description ?? null,
    settings: data.settings ?? null,
    created_at: now,
    updated_at: now,
  };

  await db.insert(projects).values(project).run();
  return project;
}

export async function getProject(db: DrizzleD1Database, id: string): Promise<Project | null> {
  const result = await db.select().from(projects).where(eq(projects.id, id)).get();
  return result ?? null;
}

export async function listProjects(
  db: DrizzleD1Database,
  workspaceId?: string,
  limit: number = 100,
): Promise<Project[]> {
  const baseQuery = db.select().from(projects);

  const query = workspaceId ? baseQuery.where(eq(projects.workspace_id, workspaceId)) : baseQuery;

  return await query.limit(limit).all();
}

export async function updateProject(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<NewProject, 'name' | 'description' | 'settings'>>,
): Promise<Project | null> {
  const now = new Date().toISOString();

  await db
    .update(projects)
    .set({
      ...data,
      updated_at: now,
    })
    .where(eq(projects.id, id))
    .run();

  return await getProject(db, id);
}

export async function deleteProject(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id)).run();
}
