/** Repository for project data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { project_settings, projects } from '~/schema';
import type { Project, ProjectSettings } from './types';

type ProjectRow = typeof projects.$inferSelect;
type ProjectSettingsRow = typeof project_settings.$inferSelect;

type NewProject = {
  workspace_id: string;
  name: string;
  description?: string | null;
  settings?: ProjectSettings | null;
};

export async function createProject(db: DrizzleD1Database, data: NewProject): Promise<Project> {
  const now = new Date().toISOString();
  const project_id = ulid();

  const projectRow: ProjectRow = {
    id: project_id,
    workspace_id: data.workspace_id,
    name: data.name,
    description: data.description ?? null,
    created_at: now,
    updated_at: now,
  };

  await db.insert(projects).values(projectRow).run();

  if (data.settings) {
    await db
      .insert(project_settings)
      .values({
        project_id,
        default_model_profile_id: data.settings.default_model_profile_id ?? null,
        rate_limit_max_concurrent_runs: data.settings.rate_limit_max_concurrent_runs ?? null,
        rate_limit_max_llm_calls_per_hour: data.settings.rate_limit_max_llm_calls_per_hour ?? null,
        budget_max_monthly_spend_cents: data.settings.budget_max_monthly_spend_cents ?? null,
        budget_alert_threshold_cents: data.settings.budget_alert_threshold_cents ?? null,
        snapshot_policy_every_n_events: data.settings.snapshot_policy_every_n_events ?? null,
        snapshot_policy_every_n_seconds: data.settings.snapshot_policy_every_n_seconds ?? null,
        snapshot_policy_on_fan_in_complete:
          data.settings.snapshot_policy_on_fan_in_complete ?? null,
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
    .from(project_settings)
    .where(eq(project_settings.project_id, id))
    .get();

  return {
    ...projectRow,
    settings: settingsRow
      ? {
          default_model_profile_id: settingsRow.default_model_profile_id ?? undefined,
          rate_limit_max_concurrent_runs: settingsRow.rate_limit_max_concurrent_runs ?? undefined,
          rate_limit_max_llm_calls_per_hour:
            settingsRow.rate_limit_max_llm_calls_per_hour ?? undefined,
          budget_max_monthly_spend_cents: settingsRow.budget_max_monthly_spend_cents ?? undefined,
          budget_alert_threshold_cents: settingsRow.budget_alert_threshold_cents ?? undefined,
          snapshot_policy_every_n_events: settingsRow.snapshot_policy_every_n_events ?? undefined,
          snapshot_policy_every_n_seconds: settingsRow.snapshot_policy_every_n_seconds ?? undefined,
          snapshot_policy_on_fan_in_complete:
            settingsRow.snapshot_policy_on_fan_in_complete ?? undefined,
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
  const query = workspaceId ? baseQuery.where(eq(projects.workspace_id, workspaceId)) : baseQuery;
  const projectRows = await query.limit(limit).all();

  const allSettings = await db.select().from(project_settings).all();
  const settingsMap = new Map(allSettings.map((s) => [s.project_id, s]));

  return projectRows.map((projectRow) => {
    const settingsRow = settingsMap.get(projectRow.id);
    return {
      ...projectRow,
      settings: settingsRow
        ? {
            default_model_profile_id: settingsRow.default_model_profile_id ?? undefined,
            rate_limit_max_concurrent_runs: settingsRow.rate_limit_max_concurrent_runs ?? undefined,
            rate_limit_max_llm_calls_per_hour:
              settingsRow.rate_limit_max_llm_calls_per_hour ?? undefined,
            budget_max_monthly_spend_cents: settingsRow.budget_max_monthly_spend_cents ?? undefined,
            budget_alert_threshold_cents: settingsRow.budget_alert_threshold_cents ?? undefined,
            snapshot_policy_every_n_events: settingsRow.snapshot_policy_every_n_events ?? undefined,
            snapshot_policy_every_n_seconds:
              settingsRow.snapshot_policy_every_n_seconds ?? undefined,
            snapshot_policy_on_fan_in_complete:
              settingsRow.snapshot_policy_on_fan_in_complete ?? undefined,
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
        updated_at: now,
      })
      .where(eq(projects.id, id))
      .run();
  }

  if (data.settings) {
    const existingSettings = await db
      .select()
      .from(project_settings)
      .where(eq(project_settings.project_id, id))
      .get();

    if (existingSettings) {
      await db
        .update(project_settings)
        .set({
          default_model_profile_id: data.settings.default_model_profile_id ?? null,
          rate_limit_max_concurrent_runs: data.settings.rate_limit_max_concurrent_runs ?? null,
          rate_limit_max_llm_calls_per_hour:
            data.settings.rate_limit_max_llm_calls_per_hour ?? null,
          budget_max_monthly_spend_cents: data.settings.budget_max_monthly_spend_cents ?? null,
          budget_alert_threshold_cents: data.settings.budget_alert_threshold_cents ?? null,
          snapshot_policy_every_n_events: data.settings.snapshot_policy_every_n_events ?? null,
          snapshot_policy_every_n_seconds: data.settings.snapshot_policy_every_n_seconds ?? null,
          snapshot_policy_on_fan_in_complete:
            data.settings.snapshot_policy_on_fan_in_complete ?? null,
        })
        .where(eq(project_settings.project_id, id))
        .run();
    } else {
      await db
        .insert(project_settings)
        .values({
          project_id: id,
          default_model_profile_id: data.settings.default_model_profile_id ?? null,
          rate_limit_max_concurrent_runs: data.settings.rate_limit_max_concurrent_runs ?? null,
          rate_limit_max_llm_calls_per_hour:
            data.settings.rate_limit_max_llm_calls_per_hour ?? null,
          budget_max_monthly_spend_cents: data.settings.budget_max_monthly_spend_cents ?? null,
          budget_alert_threshold_cents: data.settings.budget_alert_threshold_cents ?? null,
          snapshot_policy_every_n_events: data.settings.snapshot_policy_every_n_events ?? null,
          snapshot_policy_every_n_seconds: data.settings.snapshot_policy_every_n_seconds ?? null,
          snapshot_policy_on_fan_in_complete:
            data.settings.snapshot_policy_on_fan_in_complete ?? null,
        })
        .run();
    }
  }

  return await getProject(db, id);
}

export async function deleteProject(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id)).run();
}
