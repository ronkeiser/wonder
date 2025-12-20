/** Repository for artifact type data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { artifactTypes } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { ArtifactType } from './types';

type NewArtifactType = NewEntity<typeof artifactTypes.$inferInsert>;

export async function createArtifactType(
  db: DrizzleD1Database,
  data: NewArtifactType,
): Promise<ArtifactType> {
  const now = new Date().toISOString();
  const [artifactType] = await db
    .insert(artifactTypes)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return artifactType;
}

export async function getArtifactType(
  db: DrizzleD1Database,
  id: string,
): Promise<ArtifactType | null> {
  const result = await db.select().from(artifactTypes).where(eq(artifactTypes.id, id)).get();
  return result ?? null;
}

export async function getArtifactTypeVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<ArtifactType | null> {
  const result = await db
    .select()
    .from(artifactTypes)
    .where(and(eq(artifactTypes.id, id), eq(artifactTypes.version, version)))
    .get();
  return result ?? null;
}

export async function getLatestArtifactType(
  db: DrizzleD1Database,
  id: string,
): Promise<ArtifactType | null> {
  const result = await db
    .select()
    .from(artifactTypes)
    .where(eq(artifactTypes.id, id))
    .orderBy(desc(artifactTypes.version))
    .get();
  return result ?? null;
}

export async function listArtifactTypes(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<ArtifactType[]> {
  return await db.select().from(artifactTypes).limit(limit).all();
}

export async function deleteArtifactType(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(artifactTypes)
      .where(and(eq(artifactTypes.id, id), eq(artifactTypes.version, version)))
      .run();
  } else {
    await db.delete(artifactTypes).where(eq(artifactTypes.id, id)).run();
  }
}

export async function getArtifactTypeByNameAndHash(
  db: DrizzleD1Database,
  name: string,
  contentHash: string,
): Promise<ArtifactType | null> {
  const result = await db
    .select()
    .from(artifactTypes)
    .where(and(eq(artifactTypes.name, name), eq(artifactTypes.contentHash, contentHash)))
    .get();
  return result ?? null;
}

export async function getMaxVersionByName(
  db: DrizzleD1Database,
  name: string,
): Promise<number> {
  const result = await db
    .select({ version: artifactTypes.version })
    .from(artifactTypes)
    .where(eq(artifactTypes.name, name))
    .orderBy(desc(artifactTypes.version))
    .limit(1)
    .get();
  return result?.version ?? 0;
}
