/**
 * Generic versioning utility for entity tables.
 *
 * Every versioned entity table has the same columns:
 *   id, version, reference, contentHash
 * and optionally scope columns (projectId, libraryId).
 *
 * These functions operate on any such table, parameterized via Drizzle's
 * type system. No JSON blobs, no kind discriminators.
 */

import { and, desc, eq, isNull, max, type SQL } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { SQLiteColumn, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';

// ============================================================================
// Types
// ============================================================================

/**
 * A Drizzle SQLite table that has versioning columns (id, version, reference, contentHash).
 * We use `any` for the table config generic because Drizzle's concrete table types
 * don't satisfy an explicit index signature constraint. Column access is still
 * type-safe at each call site because T is inferred from the actual table passed in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VersionedTable = SQLiteTableWithColumns<any> & {
  id: SQLiteColumn;
  version: SQLiteColumn;
  reference: SQLiteColumn;
  contentHash: SQLiteColumn;
};

/** Optional scope for tables with projectId/libraryId columns. */
export type Scope = {
  projectId?: string | null;
  libraryId?: string | null;
};

/** Columns used for scope filtering, passed by the caller. */
export type ScopeColumns = {
  projectId?: SQLiteColumn;
  libraryId?: SQLiteColumn;
};

// ============================================================================
// Scope Helpers
// ============================================================================

function scopeConditions(scope: Scope, columns: ScopeColumns): SQL[] {
  const conditions: SQL[] = [];

  if (columns.projectId) {
    if (scope.projectId != null) {
      conditions.push(eq(columns.projectId, scope.projectId));
    } else {
      conditions.push(isNull(columns.projectId));
    }
  }

  if (columns.libraryId) {
    if (scope.libraryId != null) {
      conditions.push(eq(columns.libraryId, scope.libraryId));
    } else {
      conditions.push(isNull(columns.libraryId));
    }
  }

  return conditions;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get an entity by id, optionally at a specific version.
 * If version is not specified, returns the latest version.
 */
export async function getByIdAndVersion<T extends VersionedTable>(
  db: DrizzleD1Database,
  table: T,
  id: string,
  version?: number,
): Promise<T['$inferSelect'] | null> {
  if (version !== undefined) {
    const result = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.version, version)))
      .get();
    return (result as T['$inferSelect'] | undefined) ?? null;
  }

  const result = await db
    .select()
    .from(table)
    .where(eq(table.id, id))
    .orderBy(desc(table.version))
    .get();
  return (result as T['$inferSelect'] | undefined) ?? null;
}

/**
 * Get the latest version of an entity by reference.
 */
export async function getLatestByReference<T extends VersionedTable>(
  db: DrizzleD1Database,
  table: T,
  reference: string,
  scope?: Scope,
  scopeCols?: ScopeColumns,
): Promise<T['$inferSelect'] | null> {
  const conditions: SQL[] = [eq(table.reference, reference)];

  if (scope && scopeCols) {
    conditions.push(...scopeConditions(scope, scopeCols));
  }

  const result = await db
    .select()
    .from(table)
    .where(and(...conditions))
    .orderBy(desc(table.version))
    .get();

  return (result as T['$inferSelect'] | undefined) ?? null;
}

/**
 * Get a specific version of an entity by reference.
 */
export async function getByReferenceAndVersion<T extends VersionedTable>(
  db: DrizzleD1Database,
  table: T,
  reference: string,
  version: number,
  scope?: Scope,
  scopeCols?: ScopeColumns,
): Promise<T['$inferSelect'] | null> {
  const conditions: SQL[] = [
    eq(table.reference, reference),
    eq(table.version, version),
  ];

  if (scope && scopeCols) {
    conditions.push(...scopeConditions(scope, scopeCols));
  }

  const result = await db
    .select()
    .from(table)
    .where(and(...conditions))
    .get();

  return (result as T['$inferSelect'] | undefined) ?? null;
}

/**
 * Find an entity by reference and content hash (for deduplication).
 */
export async function getByReferenceAndHash<T extends VersionedTable>(
  db: DrizzleD1Database,
  table: T,
  reference: string,
  contentHash: string,
  scope?: Scope,
  scopeCols?: ScopeColumns,
): Promise<T['$inferSelect'] | null> {
  const conditions: SQL[] = [
    eq(table.reference, reference),
    eq(table.contentHash, contentHash),
  ];

  if (scope && scopeCols) {
    conditions.push(...scopeConditions(scope, scopeCols));
  }

  const result = await db
    .select()
    .from(table)
    .where(and(...conditions))
    .get();

  return (result as T['$inferSelect'] | undefined) ?? null;
}

/**
 * Get the maximum version number for a reference.
 */
export async function getMaxVersion<T extends VersionedTable>(
  db: DrizzleD1Database,
  table: T,
  reference: string,
  scope?: Scope,
  scopeCols?: ScopeColumns,
): Promise<number> {
  const conditions: SQL[] = [eq(table.reference, reference)];

  if (scope && scopeCols) {
    conditions.push(...scopeConditions(scope, scopeCols));
  }

  const result = await db
    .select({ maxVersion: max(table.version) })
    .from(table)
    .where(and(...conditions))
    .get();

  return (result?.maxVersion as number | null) ?? 0;
}

/**
 * Resolve a reference to a concrete entity.
 * If version is null, resolves to latest. If specified, resolves to that version.
 */
export async function resolveReference<T extends VersionedTable>(
  db: DrizzleD1Database,
  table: T,
  reference: string,
  version: number | null,
  scope?: Scope,
  scopeCols?: ScopeColumns,
): Promise<T['$inferSelect'] | null> {
  if (version === null) {
    return getLatestByReference(db, table, reference, scope, scopeCols);
  }
  return getByReferenceAndVersion(db, table, reference, version, scope, scopeCols);
}

/**
 * Delete an entity by id, optionally at a specific version.
 * If version is not specified, deletes all versions.
 */
export async function deleteById<T extends VersionedTable>(
  db: DrizzleD1Database,
  table: T,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(table)
      .where(and(eq(table.id, id), eq(table.version, version)))
      .run();
  } else {
    await db.delete(table).where(eq(table.id, id)).run();
  }
}
