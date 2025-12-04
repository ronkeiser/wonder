/** Repository for workflow run data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { projects, workflow_runs } from '~/infrastructure/db/schema';

type WorkflowRun = typeof workflow_runs.$inferSelect;

export async function getWorkflowRun(
  db: DrizzleD1Database,
  id: string,
): Promise<WorkflowRun | null> {
  const result = await db.select().from(workflow_runs).where(eq(workflow_runs.id, id)).get();
  return result ?? null;
}

export async function getWorkflowRunWithProject(
  db: DrizzleD1Database,
  id: string,
): Promise<
  | (WorkflowRun & {
      workspace_id: string;
    })
  | null
> {
  const run = await getWorkflowRun(db, id);
  if (!run) return null;

  // Get workspace_id from project
  const project = await db.select().from(projects).where(eq(projects.id, run.project_id)).get();
  if (!project) return null;

  return {
    ...run,
    workspace_id: project.workspace_id,
  };
}

export async function updateWorkflowRun(
  db: DrizzleD1Database,
  id: string,
  updates: {
    status?: 'running' | 'completed' | 'failed' | 'waiting';
    completed_at?: string;
    context?: object;
  },
): Promise<boolean> {
  const result = await db
    .update(workflow_runs)
    .set({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .where(eq(workflow_runs.id, id))
    .returning({ id: workflow_runs.id });

  return result.length > 0;
}
