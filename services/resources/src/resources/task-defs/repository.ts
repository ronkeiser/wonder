/** Repository for task definition data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { task_defs, type RetryConfig, type Step } from '../../infrastructure/db/schema';
import type { TaskDef } from './types';

type NewTaskDef = Omit<typeof task_defs.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

export async function createTaskDef(db: DrizzleD1Database, data: NewTaskDef): Promise<TaskDef> {
  const now = new Date().toISOString();
  const taskDef = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(task_defs).values(taskDef).run();
  return taskDef as TaskDef;
}

export async function getTaskDef(db: DrizzleD1Database, id: string): Promise<TaskDef | null> {
  const result = await db.select().from(task_defs).where(eq(task_defs.id, id)).get();
  return result ?? null;
}

export async function getTaskDefVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<TaskDef | null> {
  const result = await db
    .select()
    .from(task_defs)
    .where(and(eq(task_defs.id, id), eq(task_defs.version, version)))
    .get();
  return result ?? null;
}

export async function getLatestTaskDef(db: DrizzleD1Database, id: string): Promise<TaskDef | null> {
  const result = await db
    .select()
    .from(task_defs)
    .where(eq(task_defs.id, id))
    .orderBy(desc(task_defs.version))
    .get();
  return result ?? null;
}

export async function listTaskDefs(db: DrizzleD1Database, limit: number = 100): Promise<TaskDef[]> {
  return await db.select().from(task_defs).limit(limit).all();
}

export async function listTaskDefsByProject(
  db: DrizzleD1Database,
  projectId: string,
  limit: number = 100,
): Promise<TaskDef[]> {
  return await db
    .select()
    .from(task_defs)
    .where(eq(task_defs.project_id, projectId))
    .limit(limit)
    .all();
}

export async function listTaskDefsByLibrary(
  db: DrizzleD1Database,
  libraryId: string,
  limit: number = 100,
): Promise<TaskDef[]> {
  return await db
    .select()
    .from(task_defs)
    .where(eq(task_defs.library_id, libraryId))
    .limit(limit)
    .all();
}

export async function deleteTaskDef(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(task_defs)
      .where(and(eq(task_defs.id, id), eq(task_defs.version, version)))
      .run();
  } else {
    await db.delete(task_defs).where(eq(task_defs.id, id)).run();
  }
}
