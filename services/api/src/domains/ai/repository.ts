/** Repository for AI domain entities */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { model_profiles, prompt_specs } from '~/infrastructure/db/schema';

type PromptSpec = typeof prompt_specs.$inferSelect;
type NewPromptSpec = Omit<
  typeof prompt_specs.$inferInsert,
  'id' | 'version' | 'created_at' | 'updated_at'
>;

type ModelProfile = typeof model_profiles.$inferSelect;
type NewModelProfile = Omit<typeof model_profiles.$inferInsert, 'id'>;

/** PromptSpec */

export async function createPromptSpec(
  db: DrizzleD1Database,
  data: NewPromptSpec,
): Promise<PromptSpec> {
  const now = new Date().toISOString();
  const spec = {
    id: ulid(),
    version: 1,
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

/** ModelProfile */

export async function createModelProfile(
  db: DrizzleD1Database,
  data: NewModelProfile,
): Promise<ModelProfile> {
  const profile = {
    id: ulid(),
    ...data,
  };

  await db.insert(model_profiles).values(profile).run();
  return profile as ModelProfile;
}

export async function getModelProfile(
  db: DrizzleD1Database,
  id: string,
): Promise<ModelProfile | null> {
  const result = await db.select().from(model_profiles).where(eq(model_profiles.id, id)).get();
  return result ?? null;
}

export async function listModelProfilesByProvider(
  db: DrizzleD1Database,
  provider: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local',
): Promise<ModelProfile[]> {
  return await db.select().from(model_profiles).where(eq(model_profiles.provider, provider)).all();
}
