/** Repository for library data access */

import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { libraries, personas, tasks, tools, workflowDefs } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Library, StandardLibraryManifest, DefinitionInfo } from './types';

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
 * Get definitions for a specific library
 */
export async function getLibraryDefinitions(
  db: DrizzleD1Database,
  libraryId: string,
): Promise<DefinitionInfo[]> {
  const results: DefinitionInfo[] = [];

  // Get tools
  const libraryTools = await db
    .select({ id: tools.id, name: tools.name })
    .from(tools)
    .where(eq(tools.libraryId, libraryId))
    .all();
  for (const t of libraryTools) {
    results.push({ id: t.id, name: t.name, type: 'tool' });
  }

  // Get tasks (latest version only by using distinct on name)
  const libraryTasks = await db
    .select({ id: tasks.id, name: tasks.name })
    .from(tasks)
    .where(eq(tasks.libraryId, libraryId))
    .all();
  // Dedupe by name (take first/latest)
  const seenTaskNames = new Set<string>();
  for (const t of libraryTasks) {
    if (!seenTaskNames.has(t.name)) {
      seenTaskNames.add(t.name);
      results.push({ id: t.id, name: t.name, type: 'task' });
    }
  }

  // Get workflow defs (latest version only)
  const libraryWorkflowDefs = await db
    .select({ id: workflowDefs.id, name: workflowDefs.name })
    .from(workflowDefs)
    .where(eq(workflowDefs.libraryId, libraryId))
    .all();
  const seenWflowNames = new Set<string>();
  for (const w of libraryWorkflowDefs) {
    if (!seenWflowNames.has(w.name)) {
      seenWflowNames.add(w.name);
      results.push({ id: w.id, name: w.name, type: 'workflow' });
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
