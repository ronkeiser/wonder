/** Repository for effects domain entities */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { actions } from '~/infrastructure/db/schema';

type Action = typeof actions.$inferSelect;
type NewAction = Omit<typeof actions.$inferInsert, 'id' | 'version' | 'created_at' | 'updated_at'>;

/** Action */

export async function createAction(db: DrizzleD1Database, data: NewAction): Promise<Action> {
  const now = new Date().toISOString();
  const action = {
    id: ulid(),
    version: 1,
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(actions).values(action).run();
  return action as Action;
}

export async function getAction(db: DrizzleD1Database, id: string): Promise<Action | null> {
  const result = await db.select().from(actions).where(eq(actions.id, id)).get();
  return result ?? null;
}

export async function getActionVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<Action | null> {
  const result = await db
    .select()
    .from(actions)
    .where(and(eq(actions.id, id), eq(actions.version, version)))
    .get();
  return result ?? null;
}

type ActionKind =
  | 'llm_call'
  | 'mcp_tool'
  | 'http_request'
  | 'human_input'
  | 'update_context'
  | 'write_artifact'
  | 'workflow_call'
  | 'vector_search'
  | 'emit_metric';

export async function listActionsByKind(
  db: DrizzleD1Database,
  kind: ActionKind,
): Promise<Action[]> {
  return await db.select().from(actions).where(eq(actions.kind, kind)).all();
}

export async function deleteAction(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(actions).where(eq(actions.id, id)).run();
}
