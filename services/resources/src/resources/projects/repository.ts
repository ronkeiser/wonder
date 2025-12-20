/** Repository for project data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { projectSettings, projects } from '~/schema';
import type { Project, ProjectSettings } from './types';

type ProjectRow = typeof projects.$inferSelect;
type ProjectSettingsRow = typeof projectSettings.$inferSelect;

type NewProject = {
  workspaceId: string;
  name: string;
  description?: string | null;
  settings?: ProjectSettings | null;
};

export async function createProject(db: DrizzleD1Database, data: NewProject): Promise<Project> {
  const now = new Date().toISOString();
  const projectId = ulid();

  const projectRow: ProjectRow = {
    id: projectId,
    workspaceId: data.workspaceId,
    name: data.name,
    description: data.description ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(projects).values(projectRow).run();

  if (data.settings) {
    await db
      .insert(projectSettings)
      .values({
        projectId,
        defaultModelProfileId: data.settings.defaultModelProfileId ?? null,
        rateLimitMaxConcurrentRuns: data.settings.rateLimitMaxConcurrentRuns ?? null,
        rateLimitMaxLlmCallsPerHour: data.settings.rateLimitMaxLlmCallsPerHour ?? null,
        budgetMaxMonthlySpendCents: data.settings.budgetMaxMonthlySpendCents ?? null,
        budgetAlertThresholdCents: data.settings.budgetAlertThresholdCents ?? null,
        snapshotPolicyEveryNEvents: data.settings.snapshotPolicyEveryNEvents ?? null,
        snapshotPolicyEveryNSeconds: data.settings.snapshotPolicyEveryNSeconds ?? null,
        snapshotPolicyOnFanInComplete:
          data.settings.snapshotPolicyOnFanInComplete ?? null,
      })
      .run();
  }

  return {
    ...projectRow,
    settings: data.settings ?? null,
  };
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
    settings: settingsRow
      ? {
          defaultModelProfileId: settingsRow.defaultModelProfileId ?? undefined,
          rateLimitMaxConcurrentRuns: settingsRow.rateLimitMaxConcurrentRuns ?? undefined,
          rateLimitMaxLlmCallsPerHour:
            settingsRow.rateLimitMaxLlmCallsPerHour ?? undefined,
          budgetMaxMonthlySpendCents: settingsRow.budgetMaxMonthlySpendCents ?? undefined,
          budgetAlertThresholdCents: settingsRow.budgetAlertThresholdCents ?? undefined,
          snapshotPolicyEveryNEvents: settingsRow.snapshotPolicyEveryNEvents ?? undefined,
          snapshotPolicyEveryNSeconds: settingsRow.snapshotPolicyEveryNSeconds ?? undefined,
          snapshotPolicyOnFanInComplete:
            settingsRow.snapshotPolicyOnFanInComplete ?? undefined,
        }
      : null,
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
      settings: settingsRow
        ? {
            defaultModelProfileId: settingsRow.defaultModelProfileId ?? undefined,
            rateLimitMaxConcurrentRuns: settingsRow.rateLimitMaxConcurrentRuns ?? undefined,
            rateLimitMaxLlmCallsPerHour:
              settingsRow.rateLimitMaxLlmCallsPerHour ?? undefined,
            budgetMaxMonthlySpendCents: settingsRow.budgetMaxMonthlySpendCents ?? undefined,
            budgetAlertThresholdCents: settingsRow.budgetAlertThresholdCents ?? undefined,
            snapshotPolicyEveryNEvents: settingsRow.snapshotPolicyEveryNEvents ?? undefined,
            snapshotPolicyEveryNSeconds:
              settingsRow.snapshotPolicyEveryNSeconds ?? undefined,
            snapshotPolicyOnFanInComplete:
              settingsRow.snapshotPolicyOnFanInComplete ?? undefined,
          }
        : null,
    };
  });
}

export async function updateProject(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<NewProject, 'name' | 'description' | 'settings'>>,
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
        .set({
          defaultModelProfileId: data.settings.defaultModelProfileId ?? null,
          rateLimitMaxConcurrentRuns: data.settings.rateLimitMaxConcurrentRuns ?? null,
          rateLimitMaxLlmCallsPerHour:
            data.settings.rateLimitMaxLlmCallsPerHour ?? null,
          budgetMaxMonthlySpendCents: data.settings.budgetMaxMonthlySpendCents ?? null,
          budgetAlertThresholdCents: data.settings.budgetAlertThresholdCents ?? null,
          snapshotPolicyEveryNEvents: data.settings.snapshotPolicyEveryNEvents ?? null,
          snapshotPolicyEveryNSeconds: data.settings.snapshotPolicyEveryNSeconds ?? null,
          snapshotPolicyOnFanInComplete:
            data.settings.snapshotPolicyOnFanInComplete ?? null,
        })
        .where(eq(projectSettings.projectId, id))
        .run();
    } else {
      await db
        .insert(projectSettings)
        .values({
          projectId: id,
          defaultModelProfileId: data.settings.defaultModelProfileId ?? null,
          rateLimitMaxConcurrentRuns: data.settings.rateLimitMaxConcurrentRuns ?? null,
          rateLimitMaxLlmCallsPerHour:
            data.settings.rateLimitMaxLlmCallsPerHour ?? null,
          budgetMaxMonthlySpendCents: data.settings.budgetMaxMonthlySpendCents ?? null,
          budgetAlertThresholdCents: data.settings.budgetAlertThresholdCents ?? null,
          snapshotPolicyEveryNEvents: data.settings.snapshotPolicyEveryNEvents ?? null,
          snapshotPolicyEveryNSeconds: data.settings.snapshotPolicyEveryNSeconds ?? null,
          snapshotPolicyOnFanInComplete:
            data.settings.snapshotPolicyOnFanInComplete ?? null,
        })
        .run();
    }
  }

  return await getProject(db, id);
}

export async function deleteProject(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id)).run();
}
