/** Repository for workflow data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { workflow_defs, workflow_runs, workflows } from '~/schema';
import type { Workflow, WorkflowRun } from './types';

type NewWorkflow = Omit<typeof workflows.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

export async function createWorkflow(db: DrizzleD1Database, data: NewWorkflow): Promise<Workflow> {
  const now = new Date().toISOString();
  const workflow = {
    id: ulid(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(workflows).values(workflow).run();
  return workflow as Workflow;
}

export async function getWorkflow(db: DrizzleD1Database, id: string): Promise<Workflow | null> {
  const result = await db.select().from(workflows).where(eq(workflows.id, id)).get();
  return result ?? null;
}

export async function listWorkflows(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<Workflow[]> {
  return await db.select().from(workflows).limit(limit).all();
}

export async function listWorkflowsByProject(
  db: DrizzleD1Database,
  projectId: string,
  limit: number = 100,
): Promise<Workflow[]> {
  return await db
    .select()
    .from(workflows)
    .where(eq(workflows.projectId, projectId))
    .limit(limit)
    .all();
}

export async function updateWorkflow(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<NewWorkflow, 'name' | 'description' | 'pinnedVersion' | 'enabled'>>,
): Promise<Workflow | null> {
  const now = new Date().toISOString();

  await db
    .update(workflows)
    .set({
      ...data,
      updatedAt: now,
    })
    .where(eq(workflows.id, id))
    .run();

  return await getWorkflow(db, id);
}

export async function deleteWorkflow(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(workflows).where(eq(workflows.id, id)).run();
}

export async function getWorkflowWithDef(
  db: DrizzleD1Database,
  workflowId: string,
): Promise<{
  workflow: Workflow;
  workflowDef: typeof workflow_defs.$inferSelect;
} | null> {
  const workflow = await getWorkflow(db, workflowId);
  if (!workflow) return null;

  // Get the workflow def - use pinnedVersion if set, otherwise get latest
  const workflowDefQuery = workflow.pinnedVersion
    ? db
        .select()
        .from(workflow_defs)
        .where(
          and(
            eq(workflow_defs.id, workflow.workflowDefId),
            eq(workflow_defs.version, workflow.pinnedVersion),
          ),
        )
    : db
        .select()
        .from(workflow_defs)
        .where(eq(workflow_defs.id, workflow.workflowDefId))
        .orderBy(desc(workflow_defs.version))
        .limit(1);

  const workflowDef = await workflowDefQuery.get();
  if (!workflowDef) return null;

  return {
    workflow,
    workflowDef,
  };
}

export async function getWorkflowRun(
  db: DrizzleD1Database,
  id: string,
): Promise<WorkflowRun | null> {
  const result = await db.select().from(workflow_runs).where(eq(workflow_runs.id, id)).get();
  return result ?? null;
}

export async function createWorkflowRun(
  db: DrizzleD1Database,
  data: {
    id: string;
    projectId: string;
    workflowId: string;
    workflowDefId: string;
    workflowVersion: number;
    status: 'running' | 'completed' | 'failed' | 'waiting';
    context: object;
    activeTokens: object[];
    durableObjectId: string;
    parentRunId?: string | null;
    parentNodeId?: string | null;
  },
): Promise<WorkflowRun> {
  const now = new Date().toISOString();
  const run = {
    ...data,
    latestSnapshot: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  await db.insert(workflow_runs).values(run).run();
  return run as WorkflowRun;
}
