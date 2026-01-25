/** Repository for library data access */

import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { definitions, libraries, tools } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Library, StandardLibraryManifest, DefinitionInfo, DefinitionType } from './types';

type NewLibrary = NewEntity<typeof libraries.$inferInsert>;

export async function createLibrary(db: DrizzleD1Database, data: NewLibrary): Promise<Library> {
  const now = new Date().toISOString();
  const [library] = await db
    .insert(libraries)
    .values({
      id: ulid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return library;
}

export async function getLibrary(db: DrizzleD1Database, id: string): Promise<Library | null> {
  const result = await db.select().from(libraries).where(eq(libraries.id, id)).get();
  return result ?? null;
}

export async function getLibraryByName(
  db: DrizzleD1Database,
  name: string,
  workspaceId: string | null,
): Promise<Library | null> {
  const condition =
    workspaceId === null
      ? and(eq(libraries.name, name), isNull(libraries.workspaceId))
      : and(eq(libraries.name, name), eq(libraries.workspaceId, workspaceId));

  const result = await db.select().from(libraries).where(condition).get();
  return result ?? null;
}

export async function listLibraries(db: DrizzleD1Database, limit: number = 100): Promise<Library[]> {
  return await db.select().from(libraries).limit(limit).all();
}

export async function listLibrariesByWorkspace(
  db: DrizzleD1Database,
  workspaceId: string,
  limit: number = 100,
): Promise<Library[]> {
  return await db
    .select()
    .from(libraries)
    .where(eq(libraries.workspaceId, workspaceId))
    .limit(limit)
    .all();
}

export async function listStandardLibraries(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<Library[]> {
  return await db
    .select()
    .from(libraries)
    .where(isNull(libraries.workspaceId))
    .limit(limit)
    .all();
}

export async function deleteLibrary(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(libraries).where(eq(libraries.id, id)).run();
}

export async function updateLibrary(
  db: DrizzleD1Database,
  id: string,
  data: Partial<NewLibrary>,
): Promise<Library | null> {
  const now = new Date().toISOString();
  const [updated] = await db
    .update(libraries)
    .set({ ...data, updatedAt: now })
    .where(eq(libraries.id, id))
    .returning();
  return updated ?? null;
}

/**
 * Get definitions for a specific library.
 *
 * All entity types (tasks, workflows, personas, etc.) are now stored in the unified
 * definitions table. This function queries by libraryId and groups by kind.
 */
export async function getLibraryDefinitions(
  db: DrizzleD1Database,
  libraryId: string,
): Promise<DefinitionInfo[]> {
  const results: DefinitionInfo[] = [];

  // Get tools (still in separate tools table)
  const libraryTools = await db
    .select({ id: tools.id, name: tools.name })
    .from(tools)
    .where(eq(tools.libraryId, libraryId))
    .all();
  for (const t of libraryTools) {
    results.push({ id: t.id, name: t.name, type: 'tool' });
  }

  // Get all definitions from the unified definitions table for this library
  const libraryDefs = await db
    .select({ id: definitions.id, name: definitions.name, kind: definitions.kind })
    .from(definitions)
    .where(eq(definitions.libraryId, libraryId))
    .all();

  // Dedupe by kind+name (take first occurrence, which is latest version due to ordering)
  const seenNames = new Map<string, Set<string>>(); // kind -> Set<name>
  for (const def of libraryDefs) {
    const kindSet = seenNames.get(def.kind) ?? new Set<string>();
    if (!kindSet.has(def.name)) {
      kindSet.add(def.name);
      seenNames.set(def.kind, kindSet);

      // Map definition kind to type used in DefinitionInfo
      const typeMap: Record<string, DefinitionType> = {
        workflow_def: 'workflow',
        task: 'task',
        persona: 'persona',
        action: 'action',
        prompt_spec: 'prompt_spec',
        artifact_type: 'artifact_type',
        model_profile: 'model_profile',
      };
      const mappedType = typeMap[def.kind];
      if (mappedType) {
        results.push({ id: def.id, name: def.name, type: mappedType });
      }
    }
  }

  return results;
}

/**
 * Build the standard library manifest for validation
 */
export async function buildStandardLibraryManifest(
  db: DrizzleD1Database,
): Promise<StandardLibraryManifest> {
  // Get all standard libraries
  const standardLibs = await listStandardLibraries(db);

  const manifest: StandardLibraryManifest = { libraries: {} };

  for (const lib of standardLibs) {
    const definitions = await getLibraryDefinitions(db, lib.id);

    manifest.libraries[lib.name] = {
      definitions: {},
    };

    for (const def of definitions) {
      manifest.libraries[lib.name].definitions[def.name] = def.type;
    }
  }

  return manifest;
}
