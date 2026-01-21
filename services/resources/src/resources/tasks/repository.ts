/** Repository for task data access */

import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { tasks } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Task } from './types';

type NewTask = NewEntity<typeof tasks.$inferInsert>;

export async function createTask(db: DrizzleD1Database, data: NewTask): Promise<Task> {
  const now = new Date().toISOString();
  const [task] = await db
    .insert(tasks)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return task;
}

export async function getTask(db: DrizzleD1Database, id: string): Promise<Task | null> {
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  return result ?? null;
}

export async function getTaskVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<Task | null> {
  const result = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.version, version)))
    .get();
  return result ?? null;
}

export async function getLatestTask(db: DrizzleD1Database, id: string): Promise<Task | null> {
  const result = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .orderBy(desc(tasks.version))
    .get();
  return result ?? null;
}

export async function listTasks(db: DrizzleD1Database, limit: number = 100): Promise<Task[]> {
  return await db.select().from(tasks).limit(limit).all();
}

export async function listTasksByProject(
  db: DrizzleD1Database,
  projectId: string,
  limit: number = 100,
): Promise<Task[]> {
  return await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .limit(limit)
    .all();
}

export async function listTasksByLibrary(
  db: DrizzleD1Database,
  libraryId: string,
  limit: number = 100,
): Promise<Task[]> {
  return await db
    .select()
    .from(tasks)
    .where(eq(tasks.libraryId, libraryId))
    .limit(limit)
    .all();
}

export async function deleteTask(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.version, version)))
      .run();
  } else {
    await db.delete(tasks).where(eq(tasks.id, id)).run();
  }
}

export async function getTaskByReferenceAndHash(
  db: DrizzleD1Database,
  reference: string,
  contentHash: string,
  projectId: string | null,
  libraryId: string | null,
): Promise<Task | null> {
  const result = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.reference, reference),
        eq(tasks.contentHash, contentHash),
        projectId ? eq(tasks.projectId, projectId) : isNull(tasks.projectId),
        libraryId ? eq(tasks.libraryId, libraryId) : isNull(tasks.libraryId),
      ),
    )
    .get();
  return result ?? null;
}

export async function getMaxVersionByReference(
  db: DrizzleD1Database,
  reference: string,
  projectId: string | null,
  libraryId: string | null,
): Promise<number> {
  const result = await db
    .select({ version: tasks.version })
    .from(tasks)
    .where(
      and(
        eq(tasks.reference, reference),
        projectId ? eq(tasks.projectId, projectId) : isNull(tasks.projectId),
        libraryId ? eq(tasks.libraryId, libraryId) : isNull(tasks.libraryId),
      ),
    )
    .orderBy(desc(tasks.version))
    .limit(1)
    .get();
  return result?.version ?? 0;
}

export async function getTaskByName(
  db: DrizzleD1Database,
  name: string,
  projectId: string | null,
  libraryId: string | null,
): Promise<Task | null> {
  const result = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.name, name),
        projectId ? eq(tasks.projectId, projectId) : isNull(tasks.projectId),
        libraryId ? eq(tasks.libraryId, libraryId) : isNull(tasks.libraryId),
      ),
    )
    .orderBy(desc(tasks.version))
    .get();
  return result ?? null;
}
