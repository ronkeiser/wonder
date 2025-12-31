/** Repository for persona data access */

import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { personas } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Persona } from './types';

type NewPersona = NewEntity<typeof personas.$inferInsert>;

export async function createPersona(db: DrizzleD1Database, data: NewPersona): Promise<Persona> {
  const now = new Date().toISOString();
  const [persona] = await db
    .insert(personas)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return persona;
}

export async function getPersona(db: DrizzleD1Database, id: string): Promise<Persona | null> {
  const result = await db.select().from(personas).where(eq(personas.id, id)).get();
  return result ?? null;
}

export async function getPersonaVersion(
  db: DrizzleD1Database,
  id: string,
  version: number,
): Promise<Persona | null> {
  const result = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, id), eq(personas.version, version)))
    .get();
  return result ?? null;
}

export async function getLatestPersona(db: DrizzleD1Database, id: string): Promise<Persona | null> {
  const result = await db
    .select()
    .from(personas)
    .where(eq(personas.id, id))
    .orderBy(desc(personas.version))
    .get();
  return result ?? null;
}

export async function listPersonas(db: DrizzleD1Database, limit: number = 100): Promise<Persona[]> {
  return await db.select().from(personas).limit(limit).all();
}

export async function listPersonasByLibrary(
  db: DrizzleD1Database,
  libraryId: string,
  limit: number = 100,
): Promise<Persona[]> {
  return await db
    .select()
    .from(personas)
    .where(eq(personas.libraryId, libraryId))
    .limit(limit)
    .all();
}

export async function deletePersona(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(personas)
      .where(and(eq(personas.id, id), eq(personas.version, version)))
      .run();
  } else {
    await db.delete(personas).where(eq(personas.id, id)).run();
  }
}

export async function getPersonaByNameAndHash(
  db: DrizzleD1Database,
  name: string,
  contentHash: string,
  libraryId: string | null,
): Promise<Persona | null> {
  const result = await db
    .select()
    .from(personas)
    .where(
      and(
        eq(personas.name, name),
        eq(personas.contentHash, contentHash),
        libraryId ? eq(personas.libraryId, libraryId) : isNull(personas.libraryId),
      ),
    )
    .get();
  return result ?? null;
}

export async function getMaxVersionByName(
  db: DrizzleD1Database,
  name: string,
  libraryId: string | null,
): Promise<number> {
  const result = await db
    .select({ version: personas.version })
    .from(personas)
    .where(
      and(
        eq(personas.name, name),
        libraryId ? eq(personas.libraryId, libraryId) : isNull(personas.libraryId),
      ),
    )
    .orderBy(desc(personas.version))
    .limit(1)
    .get();
  return result?.version ?? 0;
}
