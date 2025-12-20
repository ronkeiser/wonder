/** Repository for prompt spec data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { promptSpecs } from '~/schema';
import type { NewEntity } from '~/shared/types';
import type { PromptSpec } from './types';

type NewPromptSpec = NewEntity<typeof promptSpecs.$inferInsert>;

export async function createPromptSpec(
  db: DrizzleD1Database,
  data: NewPromptSpec,
): Promise<PromptSpec> {
  const now = new Date().toISOString();
  const [spec] = await db
    .insert(promptSpecs)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return spec;
}

export async function getPromptSpec(db: DrizzleD1Database, id: string): Promise<PromptSpec | null> {
  const result = await db.select().from(promptSpecs).where(eq(promptSpecs.id, id)).get();
  return result ?? null;
}

export async function getPromptSpecVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<PromptSpec | null> {
  const result = await db
    .select()
    .from(promptSpecs)
    .where(and(eq(promptSpecs.id, id), eq(promptSpecs.version, version)))
    .get();
  return result ?? null;
}

export async function getLatestPromptSpec(
  db: DrizzleD1Database,
  id: string,
): Promise<PromptSpec | null> {
  const result = await db
    .select()
    .from(promptSpecs)
    .where(eq(promptSpecs.id, id))
    .orderBy(desc(promptSpecs.version))
    .get();
  return result ?? null;
}

export async function listPromptSpecs(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<PromptSpec[]> {
  return await db.select().from(promptSpecs).limit(limit).all();
}

export async function deletePromptSpec(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(promptSpecs)
      .where(and(eq(promptSpecs.id, id), eq(promptSpecs.version, version)))
      .run();
  } else {
    await db.delete(promptSpecs).where(eq(promptSpecs.id, id)).run();
  }
}

/**
 * Find a prompt spec by name and content hash.
 * Used for autoversion deduplication.
 */
export async function getPromptSpecByNameAndHash(
  db: DrizzleD1Database,
  name: string,
  contentHash: string,
): Promise<PromptSpec | null> {
  const result = await db
    .select()
    .from(promptSpecs)
    .where(and(eq(promptSpecs.name, name), eq(promptSpecs.contentHash, contentHash)))
    .get();
  return result ?? null;
}

/**
 * Get the maximum version number for a prompt spec by name.
 * Returns 0 if no existing prompt spec with that name exists.
 */
export async function getMaxVersionByName(db: DrizzleD1Database, name: string): Promise<number> {
  const result = await db
    .select({ version: promptSpecs.version })
    .from(promptSpecs)
    .where(eq(promptSpecs.name, name))
    .orderBy(desc(promptSpecs.version))
    .limit(1)
    .get();

  return result?.version ?? 0;
}
