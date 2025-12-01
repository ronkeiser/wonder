/** Repository for model profile data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { model_profiles } from '~/infrastructure/db/schema';

type ModelProfile = typeof model_profiles.$inferSelect;
type NewModelProfile = Omit<typeof model_profiles.$inferInsert, 'id'>;

type ModelProvider = 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';

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

export async function listModelProfiles(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<ModelProfile[]> {
  return await db.select().from(model_profiles).limit(limit).all();
}

export async function listModelProfilesByProvider(
  db: DrizzleD1Database,
  provider: ModelProvider,
  limit: number = 100,
): Promise<ModelProfile[]> {
  return await db
    .select()
    .from(model_profiles)
    .where(eq(model_profiles.provider, provider))
    .limit(limit)
    .all();
}

export async function deleteModelProfile(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(model_profiles).where(eq(model_profiles.id, id)).run();
}
