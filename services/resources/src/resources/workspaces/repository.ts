/** Repository for workspace data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { workspace_settings, workspaces } from '~/schema';
import type { Workspace, WorkspaceSettings } from './types';

type WorkspaceRow = typeof workspaces.$inferSelect;
type WorkspaceSettingsRow = typeof workspace_settings.$inferSelect;

export async function createWorkspace(
  db: DrizzleD1Database,
  data: { name: string; settings?: WorkspaceSettings | null },
): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspaceId = ulid();

  const workspaceRow: WorkspaceRow = {
    id: workspaceId,
    name: data.name,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workspaces).values(workspaceRow).run();

  // Insert settings if provided
  if (data.settings) {
    await db
      .insert(workspace_settings)
      .values({
        workspace_id: workspaceId,
        ...data.settings,
      })
      .run();
  }

  return {
    ...workspaceRow,
    settings: data.settings ?? null,
  };
}

export async function getWorkspace(db: DrizzleD1Database, id: string): Promise<Workspace | null> {
  const workspaceRow = await db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!workspaceRow) return null;

  const settingsRow = await db
    .select()
    .from(workspace_settings)
    .where(eq(workspace_settings.workspace_id, id))
    .get();

  return {
    ...workspaceRow,
    settings: settingsRow
      ? {
          allowed_model_providers: settingsRow.allowed_model_providers ?? undefined,
          allowed_mcp_servers: settingsRow.allowed_mcp_servers ?? undefined,
          budget_max_monthly_spend_cents: settingsRow.budget_max_monthly_spend_cents ?? undefined,
          budget_alert_threshold_cents: settingsRow.budget_alert_threshold_cents ?? undefined,
        }
      : null,
  };
}

export async function listWorkspaces(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<Workspace[]> {
  const workspaceRows = await db.select().from(workspaces).limit(limit).all();

  // Fetch settings for all workspaces
  const workspaceIds = workspaceRows.map((w) => w.id);
  const settingsRows =
    workspaceIds.length > 0 ? await db.select().from(workspace_settings).all() : [];

  const settingsMap = new Map(settingsRows.map((s) => [s.workspace_id, s]));

  return workspaceRows.map((workspace) => {
    const settingsRow = settingsMap.get(workspace.id);
    return {
      ...workspace,
      settings: settingsRow
        ? {
            allowed_model_providers: settingsRow.allowed_model_providers ?? undefined,
            allowed_mcp_servers: settingsRow.allowed_mcp_servers ?? undefined,
            budget_max_monthly_spend_cents: settingsRow.budget_max_monthly_spend_cents ?? undefined,
            budget_alert_threshold_cents: settingsRow.budget_alert_threshold_cents ?? undefined,
          }
        : null,
    };
  });
}

export async function updateWorkspace(
  db: DrizzleD1Database,
  id: string,
  data: { name?: string; settings?: WorkspaceSettings },
): Promise<Workspace | null> {
  const now = new Date().toISOString();

  // Update workspace if name changed
  if (data.name !== undefined) {
    await db
      .update(workspaces)
      .set({
        name: data.name,
        updated_at: now,
      })
      .where(eq(workspaces.id, id))
      .run();
  }

  // Update or insert settings if provided
  if (data.settings !== undefined) {
    const existingSettings = await db
      .select()
      .from(workspace_settings)
      .where(eq(workspace_settings.workspace_id, id))
      .get();

    if (existingSettings) {
      await db
        .update(workspace_settings)
        .set(data.settings)
        .where(eq(workspace_settings.workspace_id, id))
        .run();
    } else {
      await db
        .insert(workspace_settings)
        .values({
          workspace_id: id,
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
