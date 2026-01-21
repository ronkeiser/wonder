/** Repository for action data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { actions } from '~/schema';
import type { NewEntity } from '~/shared/types';
import type { Action } from './types';

type NewAction = NewEntity<typeof actions.$inferInsert>;

type ActionKind = Action['kind'];

export async function createAction(db: DrizzleD1Database, data: NewAction): Promise<Action> {
  const now = new Date().toISOString();
  const [action] = await db
    .insert(actions)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return action;
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

export async function getLatestAction(db: DrizzleD1Database, id: string): Promise<Action | null> {
  const result = await db
    .select()
    .from(actions)
    .where(eq(actions.id, id))
    .orderBy(desc(actions.version))
    .get();
  return result ?? null;
}

export async function listActions(db: DrizzleD1Database, limit: number = 100): Promise<Action[]> {
  return await db.select().from(actions).limit(limit).all();
}

export async function listActionsByKind(
  db: DrizzleD1Database,
  kind: ActionKind,
  limit: number = 100,
): Promise<Action[]> {
  return await db.select().from(actions).where(eq(actions.kind, kind)).limit(limit).all();
}

export async function deleteAction(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(actions)
      .where(and(eq(actions.id, id), eq(actions.version, version)))
      .run();
  } else {
    await db.delete(actions).where(eq(actions.id, id)).run();
  }
}

export async function getActionByReferenceAndHash(
  db: DrizzleD1Database,
  reference: string,
  contentHash: string,
): Promise<Action | null> {
  const result = await db
    .select()
    .from(actions)
    .where(and(eq(actions.reference, reference), eq(actions.contentHash, contentHash)))
    .get();
  return result ?? null;
}

export async function getMaxVersionByReference(db: DrizzleD1Database, reference: string): Promise<number> {
  const result = await db
    .select({ version: actions.version })
    .from(actions)
    .where(eq(actions.reference, reference))
    .orderBy(desc(actions.version))
    .limit(1)
    .get();
  return result?.version ?? 0;
}
