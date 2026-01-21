/** Repository for model profile data access */

import { and, desc, eq, max } from 'drizzle-orm';
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

/**
 * Find a model profile by name
 */
export async function getModelProfileByName(
  db: DrizzleD1Database,
  name: string,
): Promise<ModelProfile | null> {
  const result = await db.select().from(modelProfiles).where(eq(modelProfiles.name, name)).get();
  return (result as ModelProfile) ?? null;
}

/**
 * Find a model profile by reference and content hash (for autoversion deduplication)
 */
export async function getModelProfileByReferenceAndHash(
  db: DrizzleD1Database,
  reference: string,
  contentHash: string,
): Promise<ModelProfile | null> {
  // Order by createdAt DESC to get newest matching entity when duplicates exist
  // (can happen with --force deploys that skip autoversion checks)
  const result = await db
    .select()
    .from(modelProfiles)
    .where(and(eq(modelProfiles.reference, reference), eq(modelProfiles.contentHash, contentHash)))
    .orderBy(desc(modelProfiles.createdAt))
    .get();
  return (result as ModelProfile) ?? null;
}

/**
 * Model profiles don't have versioning - there's only ever one profile per reference.
 * This returns 0 if no profile exists, or 1 if one does.
 */
export async function getMaxVersionByReference(db: DrizzleD1Database, reference: string): Promise<number> {
  const result = await db
    .select({ count: max(modelProfiles.id) })
    .from(modelProfiles)
    .where(eq(modelProfiles.reference, reference))
    .get();
  // If any profile exists with this reference, return 1; otherwise 0
  return result?.count ? 1 : 0;
}
