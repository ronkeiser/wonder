/** Repository for execution domain entities */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { events, workflow_runs } from '~/infrastructure/db/schema';

type WorkflowRun = typeof workflow_runs.$inferSelect;
type NewWorkflowRun = Omit<typeof workflow_runs.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

type Token = {
  id: string;
  workflow_run_id: string;
  node_id: string;
  status: 'active' | 'waiting_at_fan_in' | 'completed' | 'cancelled';
  path_id: string;
  parent_token_id: string | null;
  fan_out_node_id: string | null;
  branch_index: number;
  branch_total: number;
  created_at: string;
  updated_at: string;
};

type NewToken = Omit<Token, 'id' | 'created_at' | 'updated_at'>;

/** WorkflowRun */

export async function createWorkflowRun(
  db: DrizzleD1Database,
  data: NewWorkflowRun,
): Promise<WorkflowRun> {
  const now = new Date().toISOString();
  const run = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workflow_runs).values(run).run();
  return run as WorkflowRun;
}

export async function getWorkflowRun(
  db: DrizzleD1Database,
  id: string,
): Promise<WorkflowRun | null> {
  const result = await db.select().from(workflow_runs).where(eq(workflow_runs.id, id)).get();
  return result ?? null;
}

export async function updateWorkflowRunStatus(
  db: DrizzleD1Database,
  id: string,
  status: string,
  completed_at?: string,
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (completed_at !== undefined) {
    updates.completed_at = completed_at;
  }

  await db.update(workflow_runs).set(updates).where(eq(workflow_runs.id, id)).run();
}

export async function updateWorkflowRunContext(
  db: DrizzleD1Database,
  id: string,
  context: unknown,
): Promise<void> {
  await db
    .update(workflow_runs)
    .set({
      context: JSON.stringify(context),
      updated_at: new Date().toISOString(),
    })
    .where(eq(workflow_runs.id, id))
    .run();
}

export async function updateWorkflowRunSnapshot(
  db: DrizzleD1Database,
  id: string,
  snapshot: unknown,
): Promise<void> {
  await db
    .update(workflow_runs)
    .set({
      latest_snapshot: JSON.stringify(snapshot),
      updated_at: new Date().toISOString(),
    })
    .where(eq(workflow_runs.id, id))
    .run();
}

/** Token (stored in workflow_runs.active_tokens JSON array for Stage 0) */

export async function createToken(db: DrizzleD1Database, data: NewToken): Promise<Token> {
  const now = new Date().toISOString();
  const token: Token = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  // For Stage 0, tokens are managed in memory/active_tokens array
  // This is a placeholder for the interface
  return token;
}

export async function getToken(db: DrizzleD1Database, id: string): Promise<Token | null> {
  // For Stage 0, tokens are in workflow_runs.active_tokens
  // This is a placeholder for the interface
  return null;
}

export async function updateTokenStatus(
  db: DrizzleD1Database,
  id: string,
  status: string,
): Promise<void> {
  // For Stage 0, tokens are managed in memory
  // This is a placeholder for the interface
}

export async function listTokensByWorkflowRun(
  db: DrizzleD1Database,
  workflow_run_id: string,
): Promise<Token[]> {
  const run = await getWorkflowRun(db, workflow_run_id);
  if (!run || !run.active_tokens) return [];

  return (
    typeof run.active_tokens === 'string' ? JSON.parse(run.active_tokens) : run.active_tokens
  ) as Token[];
}
