/** Repository for prompt spec data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { prompt_specs } from '~/schema';
import type { PromptSpec } from './types';

type NewPromptSpec = Omit<typeof prompt_specs.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

export async function createPromptSpec(
  db: DrizzleD1Database,
  data: NewPromptSpec,
): Promise<PromptSpec> {
  const now = new Date().toISOString();
  const spec = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(prompt_specs).values(spec).run();
  return spec as PromptSpec;
}

export async function getPromptSpec(db: DrizzleD1Database, id: string): Promise<PromptSpec | null> {
  const result = await db.select().from(prompt_specs).where(eq(prompt_specs.id, id)).get();
  return result ?? null;
}

export async function getPromptSpecVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<PromptSpec | null> {
  const result = await db
    .select()
    .from(prompt_specs)
    .where(and(eq(prompt_specs.id, id), eq(prompt_specs.version, version)))
    .get();
  return result ?? null;
}

export async function getLatestPromptSpec(
  db: DrizzleD1Database,
  id: string,
): Promise<PromptSpec | null> {
  const result = await db
    .select()
    .from(prompt_specs)
    .where(eq(prompt_specs.id, id))
    .orderBy(desc(prompt_specs.version))
    .get();
  return result ?? null;
}

export async function listPromptSpecs(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<PromptSpec[]> {
  return await db.select().from(prompt_specs).limit(limit).all();
}

export async function deletePromptSpec(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(prompt_specs)
      .where(and(eq(prompt_specs.id, id), eq(prompt_specs.version, version)))
      .run();
  } else {
    await db.delete(prompt_specs).where(eq(prompt_specs.id, id)).run();
  }
}
