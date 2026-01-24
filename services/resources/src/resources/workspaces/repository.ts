/** Repository for workspace data access */

import { desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { workspaceSettings, workspaces } from '~/schema';
import type { Workspace, WorkspaceInput, WorkspaceSettings } from './types';

function toSettings(row: typeof workspaceSettings.$inferSelect): WorkspaceSettings {
  const { workspaceId: _, ...settings } = row;
  return settings;
}

export async function createWorkspace(
  db: DrizzleD1Database,
  data: WorkspaceInput,
): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspaceId = ulid();

  await db
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: data.name,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Insert settings if provided
  if (data.settings) {
    await db
      .insert(workspaceSettings)
      .values({
        workspaceId: workspaceId,
        ...data.settings,
      })
      .run();
  }

  // Fetch the created workspace to get proper settings type
  return (await getWorkspace(db, workspaceId))!;
}

export async function getWorkspace(db: DrizzleD1Database, id: string): Promise<Workspace | null> {
  const workspaceRow = await db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!workspaceRow) return null;

  const settingsRow = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, id))
    .get();

  return {
    ...workspaceRow,
    settings: settingsRow ? toSettings(settingsRow) : null,
  };
}

export async function listWorkspaces(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<Workspace[]> {
  const workspaceRows = await db
    .select()
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt))
    .limit(limit)
    .all();

  // Fetch settings for all workspaces
  const workspaceIds = workspaceRows.map((w) => w.id);
  const settingsRows =
    workspaceIds.length > 0 ? await db.select().from(workspaceSettings).all() : [];

  const settingsMap = new Map(settingsRows.map((s) => [s.workspaceId, s]));

  return workspaceRows.map((workspace) => {
    const settingsRow = settingsMap.get(workspace.id);
    return {
      ...workspace,
      settings: settingsRow ? toSettings(settingsRow) : null,
    };
  });
}

export async function updateWorkspace(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<WorkspaceInput, 'name' | 'settings'>>,
): Promise<Workspace | null> {
  const now = new Date().toISOString();

  // Update workspace if name changed
  if (data.name !== undefined) {
    await db
      .update(workspaces)
      .set({
        name: data.name,
        updatedAt: now,
      })
      .where(eq(workspaces.id, id))
      .run();
  }

  // Update or insert settings if provided
  if (data.settings !== undefined && data.settings !== null) {
    const existingSettings = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, id))
      .get();

    if (existingSettings) {
      await db
        .update(workspaceSettings)
        .set(data.settings)
        .where(eq(workspaceSettings.workspaceId, id))
        .run();
    } else {
      await db
        .insert(workspaceSettings)
        .values({
          workspaceId: id,
          ...data.settings,
        })
        .run();
    }
  }

  return await getWorkspace(db, id);
}

export async function deleteWorkspace(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id)).run();
}
