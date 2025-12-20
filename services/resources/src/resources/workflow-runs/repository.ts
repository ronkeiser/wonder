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
      workspaceId: string;
    })
  | null
> {
  const run = await getWorkflowRun(db, id);
  if (!run) return null;

  // Get workspaceId from project
  const project = await db.select().from(projects).where(eq(projects.id, run.projectId)).get();
  if (!project) return null;

  return {
    ...run,
    workspaceId: project.workspaceId,
  };
}

export async function updateWorkflowRun(
  db: DrizzleD1Database,
  id: string,
  updates: {
    status?: 'running' | 'completed' | 'failed' | 'waiting';
    completedAt?: string;
    context?: object;
  },
): Promise<boolean> {
  const result = await db
    .update(workflow_runs)
    .set({
      ...updates,
      updatedAt: new Date().toISOString(),
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

  if (filters.projectId) {
    conditions.push(eq(workflow_runs.projectId, filters.projectId));
  }
  if (filters.workflowId) {
    conditions.push(eq(workflow_runs.workflowId, filters.workflowId));
  }
  if (filters.workflowDefId) {
    conditions.push(eq(workflow_runs.workflowDefId, filters.workflowDefId));
  }
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(workflow_runs.status, filters.status));
  }
  if (filters.parentRunId !== undefined) {
    // null means only root runs (no parent)
    // a string means runs with that specific parent
    if (filters.parentRunId === null) {
      conditions.push(eq(workflow_runs.parentRunId, null as unknown as string));
    } else {
      conditions.push(eq(workflow_runs.parentRunId, filters.parentRunId));
    }
  }
  if (filters.createdAfter) {
    conditions.push(gte(workflow_runs.createdAt, filters.createdAfter));
  }
  if (filters.createdBefore) {
    conditions.push(lte(workflow_runs.createdAt, filters.createdBefore));
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
    .leftJoin(workflows, eq(workflow_runs.workflowId, workflows.id))
    .where(whereClause)
    .orderBy(desc(workflow_runs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const runs: WorkflowRunWithName[] = results.map((r) => ({
    ...r.workflow_run,
    workflow_name: r.workflow_name ?? '(deleted)',
  }));

  return { runs, total };
}
