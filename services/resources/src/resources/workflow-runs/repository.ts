/** Repository for workflow run data access */

import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { projects, workflow_runs, workflows } from '~/schema';
import type { ListWorkflowRunsFilters } from './types';

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

export async function deleteWorkflowRun(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(workflow_runs).where(eq(workflow_runs.id, id)).run();
}

/** Workflow run with joined workflow name */
export type WorkflowRunWithName = WorkflowRun & { workflow_name: string };

/** List workflow runs with filters and pagination */
export async function listWorkflowRuns(
  db: DrizzleD1Database,
  filters: ListWorkflowRunsFilters = {},
): Promise<{ runs: WorkflowRunWithName[]; total: number }> {
  const conditions = [];

  if (filters.project_id) {
    conditions.push(eq(workflow_runs.project_id, filters.project_id));
  }
  if (filters.workflow_id) {
    conditions.push(eq(workflow_runs.workflow_id, filters.workflow_id));
  }
  if (filters.workflow_def_id) {
    conditions.push(eq(workflow_runs.workflow_def_id, filters.workflow_def_id));
  }
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(workflow_runs.status, filters.status));
  }
  if (filters.parent_run_id !== undefined) {
    // null means only root runs (no parent)
    // a string means runs with that specific parent
    if (filters.parent_run_id === null) {
      conditions.push(eq(workflow_runs.parent_run_id, null as unknown as string));
    } else {
      conditions.push(eq(workflow_runs.parent_run_id, filters.parent_run_id));
    }
  }
  if (filters.created_after) {
    conditions.push(gte(workflow_runs.created_at, filters.created_after));
  }
  if (filters.created_before) {
    conditions.push(lte(workflow_runs.created_at, filters.created_before));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select()
    .from(workflow_runs)
    .where(whereClause)
    .all();
  const total = countResult.length;

  // Get paginated results with workflow name via join
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const results = await db
    .select({
      workflow_run: workflow_runs,
      workflow_name: workflows.name,
    })
    .from(workflow_runs)
    .leftJoin(workflows, eq(workflow_runs.workflow_id, workflows.id))
    .where(whereClause)
    .orderBy(desc(workflow_runs.created_at))
    .limit(limit)
    .offset(offset)
    .all();

  const runs: WorkflowRunWithName[] = results.map((r) => ({
    ...r.workflow_run,
    workflow_name: r.workflow_name ?? '(deleted)',
  }));

  return { runs, total };
}
