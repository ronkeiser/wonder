/** Repository for project data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { projectSettings, projects } from '~/schema';
import type { Project, ProjectInput, ProjectSettings } from './types';

function toSettings(row: typeof projectSettings.$inferSelect): ProjectSettings {
  const { projectId: _, ...settings } = row;
  return settings;
}

export async function createProject(db: DrizzleD1Database, data: ProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const projectId = ulid();

  await db
    .insert(projects)
    .values({
      id: projectId,
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  if (data.settings) {
    await db
      .insert(projectSettings)
      .values({
        projectId,
        ...data.settings,
      })
      .run();
  }

  // Fetch the created project to get proper settings type
  return (await getProject(db, projectId))!;
}

export async function getProject(db: DrizzleD1Database, id: string): Promise<Project | null> {
  const projectRow = await db.select().from(projects).where(eq(projects.id, id)).get();
  if (!projectRow) return null;

  const settingsRow = await db
    .select()
    .from(projectSettings)
    .where(eq(projectSettings.projectId, id))
    .get();

  return {
    ...projectRow,
    settings: settingsRow ? toSettings(settingsRow) : null,
  };
}

export async function listProjects(
  db: DrizzleD1Database,
  workspaceId?: string,
  limit: number = 100,
): Promise<Project[]> {
  const baseQuery = db.select().from(projects);
  const query = workspaceId ? baseQuery.where(eq(projects.workspaceId, workspaceId)) : baseQuery;
  const projectRows = await query.limit(limit).all();

  const allSettings = await db.select().from(projectSettings).all();
  const settingsMap = new Map(allSettings.map((s) => [s.projectId, s]));

  return projectRows.map((projectRow) => {
    const settingsRow = settingsMap.get(projectRow.id);
    return {
      ...projectRow,
      settings: settingsRow ? toSettings(settingsRow) : null,
    };
  });
}

export async function updateProject(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<ProjectInput, 'name' | 'description' | 'settings'>>,
): Promise<Project | null> {
  const now = new Date().toISOString();

  if (data.name !== undefined || data.description !== undefined) {
    await db
      .update(projects)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        updatedAt: now,
      })
      .where(eq(projects.id, id))
      .run();
  }

  if (data.settings) {
    const existingSettings = await db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.projectId, id))
      .get();

    if (existingSettings) {
      await db
        .update(projectSettings)
        .set(data.settings)
        .where(eq(projectSettings.projectId, id))
        .run();
    } else {
      await db
        .insert(projectSettings)
        .values({
          projectId: id,
          ...data.settings,
        })
        .run();
    }
  }

  return await getProject(db, id);
}

export async function deleteProject(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id)).run();
}
