/** Repository for workflow data access */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { workflows } from '~/infrastructure/db/schema';

type Workflow = typeof workflows.$inferSelect;
type NewWorkflow = Omit<typeof workflows.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

export async function createWorkflow(db: DrizzleD1Database, data: NewWorkflow): Promise<Workflow> {
  const now = new Date().toISOString();
  const workflow = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
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
    .where(eq(workflows.project_id, projectId))
    .limit(limit)
    .all();
}

export async function updateWorkflow(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<NewWorkflow, 'name' | 'description' | 'pinned_version' | 'enabled'>>,
): Promise<Workflow | null> {
  const now = new Date().toISOString();

  await db
    .update(workflows)
    .set({
      ...data,
      updated_at: now,
    })
    .where(eq(workflows.id, id))
    .run();

  return await getWorkflow(db, id);
}

export async function deleteWorkflow(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(workflows).where(eq(workflows.id, id)).run();
}
