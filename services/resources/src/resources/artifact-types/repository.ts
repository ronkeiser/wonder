/** Repository for artifact type data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { artifact_types } from '../../schema';
import type { ArtifactType } from './types';

type NewArtifactType = Omit<typeof artifact_types.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

export async function createArtifactType(
  db: DrizzleD1Database,
  data: NewArtifactType,
): Promise<ArtifactType> {
  const now = new Date().toISOString();
  const artifactType = {
    id: ulid(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(artifact_types).values(artifactType).run();
  return artifactType as ArtifactType;
}

export async function getArtifactType(
  db: DrizzleD1Database,
  id: string,
): Promise<ArtifactType | null> {
  const result = await db.select().from(artifact_types).where(eq(artifact_types.id, id)).get();
  return result ?? null;
}

export async function getArtifactTypeVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<ArtifactType | null> {
  const result = await db
    .select()
    .from(artifact_types)
    .where(and(eq(artifact_types.id, id), eq(artifact_types.version, version)))
    .get();
  return result ?? null;
}

export async function getLatestArtifactType(
  db: DrizzleD1Database,
  id: string,
): Promise<ArtifactType | null> {
  const result = await db
    .select()
    .from(artifact_types)
    .where(eq(artifact_types.id, id))
    .orderBy(desc(artifact_types.version))
    .get();
  return result ?? null;
}

export async function listArtifactTypes(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<ArtifactType[]> {
  return await db.select().from(artifact_types).limit(limit).all();
}

export async function deleteArtifactType(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(artifact_types)
      .where(and(eq(artifact_types.id, id), eq(artifact_types.version, version)))
      .run();
  } else {
    await db.delete(artifact_types).where(eq(artifact_types.id, id)).run();
  }
}

export async function getArtifactTypeByNameAndHash(
  db: DrizzleD1Database,
  name: string,
  contentHash: string,
): Promise<ArtifactType | null> {
  const result = await db
    .select()
    .from(artifact_types)
    .where(and(eq(artifact_types.name, name), eq(artifact_types.contentHash, contentHash)))
    .get();
  return result ?? null;
}

export async function getMaxVersionByName(
  db: DrizzleD1Database,
  name: string,
): Promise<number> {
  const result = await db
    .select({ version: artifact_types.version })
    .from(artifact_types)
    .where(eq(artifact_types.name, name))
    .orderBy(desc(artifact_types.version))
    .limit(1)
    .get();
  return result?.version ?? 0;
}
