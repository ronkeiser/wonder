/** Repository for workflow run data access */

import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { projects, workflowRuns, workflows } from '~/schema';
import type { ListWorkflowRunsFilters } from './types';

type WorkflowRun = typeof workflowRuns.$inferSelect;

export async function getWorkflowRun(
  db: DrizzleD1Database,
  id: string,
): Promise<WorkflowRun | null> {
  try {
    const result = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
    return result ?? null;
  } catch (error) {
    // Log detailed error info before re-throwing
    const errorInfo: Record<string, unknown> = {
      workflowRunId: id,
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if ('cause' in err) errorInfo.cause = String(err.cause);
      if ('code' in err) errorInfo.code = err.code;
      if ('errno' in err) errorInfo.errno = err.errno;
      if ('meta' in err) errorInfo.meta = err.meta;
    }
    console.error('[workflow-runs.repository] getWorkflowRun failed:', JSON.stringify(errorInfo));
    throw error;
  }
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
    .update(workflowRuns)
    .set({
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workflowRuns.id, id))
    .returning({ id: workflowRuns.id });

  return result.length > 0;
}

export async function deleteWorkflowRun(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(workflowRuns).where(eq(workflowRuns.id, id)).run();
}

/** Workflow run with joined workflow name */
export type WorkflowRunWithName = WorkflowRun & { workflowName: string };

/** List workflow runs with filters and pagination */
export async function listWorkflowRuns(
  db: DrizzleD1Database,
  filters: ListWorkflowRunsFilters = {},
): Promise<{ runs: WorkflowRunWithName[]; total: number }> {
  const conditions = [];

  if (filters.projectId) {
    conditions.push(eq(workflowRuns.projectId, filters.projectId));
  }
  if (filters.workflowId) {
    conditions.push(eq(workflowRuns.workflowId, filters.workflowId));
  }
  if (filters.definitionId) {
    conditions.push(eq(workflowRuns.definitionId, filters.definitionId));
  }
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(workflowRuns.status, filters.status));
  }
  if (filters.parentRunId !== undefined) {
    // null means only root runs (no parent)
    // a string means runs with that specific parent
    if (filters.parentRunId === null) {
      conditions.push(eq(workflowRuns.parentRunId, null as unknown as string));
    } else {
      conditions.push(eq(workflowRuns.parentRunId, filters.parentRunId));
    }
  }
  if (filters.createdAfter) {
    conditions.push(gte(workflowRuns.createdAt, filters.createdAfter));
  }
  if (filters.createdBefore) {
    conditions.push(lte(workflowRuns.createdAt, filters.createdBefore));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select()
    .from(workflowRuns)
    .where(whereClause)
    .all();
  const total = countResult.length;

  // Get paginated results with workflow name via join
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const results = await db
    .select({
      workflowRun: workflowRuns,
      workflowName: workflows.name,
    })
    .from(workflowRuns)
    .leftJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
    .where(whereClause)
    .orderBy(desc(workflowRuns.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const runs: WorkflowRunWithName[] = results.map((r) => ({
    ...r.workflowRun,
    workflowName: r.workflowName ?? '(deleted)',
  }));

  return { runs, total };
}

/**
 * Create a workflow run directly from a definition (no workflow record).
 * Used for agent workflows like context assembly that are library-level.
 */
export async function createWorkflowRunFromDef(
  db: DrizzleD1Database,
  data: {
    id: string;
    projectId: string;
    definitionId: string;
    definitionVersion: number;
    status: 'running' | 'completed' | 'failed' | 'waiting';
    context: object;
    activeTokens: object[];
    durableObjectId: string;
    rootRunId: string;
    parentRunId?: string | null;
    parentNodeId?: string | null;
    parentTokenId?: string | null;
  },
): Promise<WorkflowRun> {
  const now = new Date().toISOString();
  const [run] = await db
    .insert(workflowRuns)
    .values({
      ...data,
      workflowId: null,
      latestSnapshot: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    .returning();

  return run;
}
