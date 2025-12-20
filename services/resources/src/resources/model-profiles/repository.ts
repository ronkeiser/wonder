/** Repository for model profile data access */

import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { modelProfiles } from '~/schema';
import type { ModelProfile, ModelProfileInput } from './types';

type ModelProvider = ModelProfile['provider'];

export async function createModelProfile(
  db: DrizzleD1Database,
  data: ModelProfileInput,
): Promise<ModelProfile> {
  const now = new Date().toISOString();
  const [profile] = await db
    .insert(modelProfiles)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return profile as ModelProfile;
}

export async function getModelProfile(
  db: DrizzleD1Database,
  id: string,
): Promise<ModelProfile | null> {
  const result = await db.select().from(modelProfiles).where(eq(modelProfiles.id, id)).get();
  return (result as ModelProfile) ?? null;
}

export async function listModelProfiles(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<ModelProfile[]> {
  return (await db.select().from(modelProfiles).limit(limit).all()) as ModelProfile[];
}

export async function listModelProfilesByProvider(
  db: DrizzleD1Database,
  provider: ModelProvider,
  limit: number = 100,
): Promise<ModelProfile[]> {
  return (await db
    .select()
    .from(modelProfiles)
    .where(eq(modelProfiles.provider, provider))
    .limit(limit)
    .all()) as ModelProfile[];
}

export async function deleteModelProfile(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(modelProfiles).where(eq(modelProfiles.id, id)).run();
}
