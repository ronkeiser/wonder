/** Repository for workflow data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { definitions, workflowRuns, workflows } from '~/schema';
import type { NewEntity } from '~/shared/types';
import type { Workflow, WorkflowRun } from './types';

type NewWorkflow = NewEntity<typeof workflows.$inferInsert>;

export async function createWorkflow(db: DrizzleD1Database, data: NewWorkflow): Promise<Workflow> {
  const now = new Date().toISOString();
  const [workflow] = await db
    .insert(workflows)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return workflow;
}

export async function getWorkflow(db: DrizzleD1Database, id: string): Promise<Workflow | null> {
  const result = await db.select().from(workflows).where(eq(workflows.id, id)).get();
  return result ?? null;
}

export async function listWorkflows(db: DrizzleD1Database, limit: number = 100): Promise<Workflow[]> {
  return await db.select().from(workflows).limit(limit).all();
}

export async function listWorkflowsByProject(
  db: DrizzleD1Database,
  projectId: string,
  limit: number = 100,
): Promise<Workflow[]> {
  return await db.select().from(workflows).where(eq(workflows.projectId, projectId)).limit(limit).all();
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
  definition: typeof definitions.$inferSelect;
} | null> {
  const workflow = await getWorkflow(db, workflowId);
  if (!workflow) return null;

  // Get the definition - use pinnedVersion if set, otherwise get latest
  const definitionQuery = workflow.pinnedVersion
    ? db
        .select()
        .from(definitions)
        .where(and(eq(definitions.id, workflow.definitionId), eq(definitions.version, workflow.pinnedVersion)))
    : db
        .select()
        .from(definitions)
        .where(eq(definitions.id, workflow.definitionId))
        .orderBy(desc(definitions.version))
        .limit(1);

  const definition = await definitionQuery.get();
  if (!definition) return null;

  return {
    workflow,
    definition,
  };
}

export async function getWorkflowRun(db: DrizzleD1Database, id: string): Promise<WorkflowRun | null> {
  const result = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
  return result ?? null;
}

export async function createWorkflowRun(
  db: DrizzleD1Database,
  data: {
    id: string;
    projectId: string;
    workflowId: string;
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
      latestSnapshot: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    .returning();

  return run;
}
