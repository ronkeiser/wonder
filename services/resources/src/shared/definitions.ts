/**
 * Unified repository for all versioned definitions.
 *
 * Handles CRUD operations for the `definitions` table, including:
 * - Scope validation by kind
 * - Content validation via Zod schemas
 * - Autoversioning with content hash deduplication
 * - Reference resolution (latest or pinned version)
 */

import { and, desc, eq, isNull, max, SQL } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { definitions } from '../schema';
import {
  type ContentSchemaMap,
  type DefinitionKind,
  SCOPE_RULES,
  type ScopeRule,
  validateContent,
} from './content-schemas';
import { computeContentHash } from './fingerprint';

// ============================================================================
// Types
// ============================================================================

export type Definition = typeof definitions.$inferSelect;

export type Scope = {
  projectId?: string | null;
  libraryId?: string | null;
};

export type DefinitionInput<K extends DefinitionKind = DefinitionKind> = {
  id?: string; // Optional pre-generated ID (useful for workflow_defs with FK to nodes/transitions)
  reference: string;
  name: string;
  description?: string;
  content: ContentSchemaMap[K];
  projectId?: string | null;
  libraryId?: string | null;
  autoversion?: boolean;
  /** Skip content hash deduplication and always create a new version. */
  force?: boolean;
};

export type CreateDefinitionResult =
  | { reused: true; definition: Definition; latestVersion: number }
  | { reused: false; definition: Definition };

// ============================================================================
// Scope Validation
// ============================================================================

class ScopeValidationError extends Error {
  constructor(
    kind: DefinitionKind,
    rule: ScopeRule,
    scope: Scope,
  ) {
    const message = buildScopeErrorMessage(kind, rule, scope);
    super(message);
    this.name = 'ScopeValidationError';
  }
}

function buildScopeErrorMessage(kind: DefinitionKind, rule: ScopeRule, scope: Scope): string {
  const { projectId, libraryId } = scope;
  switch (rule) {
    case 'project_or_library':
      return `${kind} requires exactly one of projectId or libraryId, got: projectId=${projectId}, libraryId=${libraryId}`;
    case 'library_only':
      return `${kind} cannot have projectId set, got: projectId=${projectId}`;
    case 'global':
      return `${kind} must have both projectId and libraryId null, got: projectId=${projectId}, libraryId=${libraryId}`;
  }
}

function validateScope(kind: DefinitionKind, scope: Scope): void {
  const rule = SCOPE_RULES[kind];
  const { projectId, libraryId } = scope;
  const hasProject = projectId != null;
  const hasLibrary = libraryId != null;

  switch (rule) {
    case 'project_or_library':
      // Exactly one of projectId or libraryId must be set
      if (hasProject === hasLibrary) {
        throw new ScopeValidationError(kind, rule, scope);
      }
      break;

    case 'library_only':
      // projectId must be null, libraryId is optional
      if (hasProject) {
        throw new ScopeValidationError(kind, rule, scope);
      }
      break;

    case 'global':
      // Both must be null
      if (hasProject || hasLibrary) {
        throw new ScopeValidationError(kind, rule, scope);
      }
      break;
  }
}

// ============================================================================
// Scope Query Helpers
// ============================================================================

function scopeCondition(scope: Scope): SQL | undefined {
  const conditions: SQL[] = [];

  if (scope.projectId != null) {
    conditions.push(eq(definitions.projectId, scope.projectId));
  } else {
    conditions.push(isNull(definitions.projectId));
  }

  if (scope.libraryId != null) {
    conditions.push(eq(definitions.libraryId, scope.libraryId));
  } else {
    conditions.push(isNull(definitions.libraryId));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Creates a new definition with autoversion support.
 *
 * ID stability: all versions of a definition share the same ID.
 * The ID is established on first creation and reused for all subsequent versions.
 * `(kind, reference, scope)` identifies the logical entity; `id` is its stable key.
 *
 * If `autoversion` is true (and not `force`):
 * - Checks for existing definition with same reference + content hash
 * - If found, returns existing (reused)
 * - If not found, increments version and creates new with same ID
 *
 * If `force` is true:
 * - Skips hash deduplication, always creates a new version with same ID
 *
 * If `autoversion` is false (first creation):
 * - Creates with version 1 and a new ID
 */
export async function createDefinition<K extends DefinitionKind>(
  db: DrizzleD1Database,
  kind: K,
  input: DefinitionInput<K>,
): Promise<CreateDefinitionResult> {
  const scope: Scope = {
    projectId: input.projectId ?? null,
    libraryId: input.libraryId ?? null,
  };

  // Validate scope
  validateScope(kind, scope);

  // Validate content
  const validatedContent = validateContent(kind, input.content);

  // Compute content hash (excludes generated ID fields at all levels)
  const contentHash = await computeContentHash(validatedContent as Record<string, unknown>);

  if (input.autoversion || input.force) {
    // Look up existing definition to get stable ID
    const latest = await getLatestDefinition(db, kind, input.reference, scope);
    const stableId = latest?.id ?? input.id ?? ulid();

    // Unless forcing, check for content hash match (deduplication)
    if (!input.force) {
      const existing = await getDefinitionByReferenceAndHash(
        db,
        kind,
        input.reference,
        contentHash,
        scope,
      );

      if (existing) {
        const latestVersion = await getMaxVersionByReference(db, kind, input.reference, scope);
        return { reused: true, definition: existing, latestVersion };
      }
    }

    // Create new version with stable ID
    const maxVersion = await getMaxVersionByReference(db, kind, input.reference, scope);
    const version = maxVersion + 1;

    const definition = await insertDefinition(db, kind, input, validatedContent, contentHash, version, scope, stableId);
    return { reused: false, definition };
  }

  // Non-autoversion: first creation, version 1
  const definition = await insertDefinition(db, kind, input, validatedContent, contentHash, 1, scope);
  return { reused: false, definition };
}

async function insertDefinition<K extends DefinitionKind>(
  db: DrizzleD1Database,
  kind: K,
  input: DefinitionInput<K>,
  content: ContentSchemaMap[K],
  contentHash: string,
  version: number,
  scope: Scope,
  stableId?: string,
): Promise<Definition> {
  const now = new Date().toISOString();
  const [definition] = await db
    .insert(definitions)
    .values({
      id: stableId ?? input.id ?? ulid(),
      version,
      kind,
      reference: input.reference,
      name: input.name,
      description: input.description ?? '',
      projectId: scope.projectId ?? null,
      libraryId: scope.libraryId ?? null,
      contentHash,
      content: content as object,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return definition;
}

/**
 * Gets a definition by id, optionally at a specific version.
 * If version is not specified, returns the latest version.
 */
export async function getDefinition(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<Definition | null> {
  if (version !== undefined) {
    const result = await db
      .select()
      .from(definitions)
      .where(and(eq(definitions.id, id), eq(definitions.version, version)))
      .get();
    return result ?? null;
  }

  // Latest version for this id
  const result = await db
    .select()
    .from(definitions)
    .where(eq(definitions.id, id))
    .orderBy(desc(definitions.version))
    .get();
  return result ?? null;
}

/**
 * Gets the latest version of a definition by kind and reference.
 */
export async function getLatestDefinition(
  db: DrizzleD1Database,
  kind: DefinitionKind,
  reference: string,
  scope?: Scope,
): Promise<Definition | null> {
  const conditions = [eq(definitions.kind, kind), eq(definitions.reference, reference)];

  if (scope) {
    const scopeCond = scopeCondition(scope);
    if (scopeCond) conditions.push(scopeCond);
  }

  const result = await db
    .select()
    .from(definitions)
    .where(and(...conditions))
    .orderBy(desc(definitions.version))
    .get();

  return result ?? null;
}

/**
 * Gets a specific version of a definition by kind and reference.
 */
export async function getDefinitionByVersion(
  db: DrizzleD1Database,
  kind: DefinitionKind,
  reference: string,
  version: number,
  scope?: Scope,
): Promise<Definition | null> {
  const conditions = [
    eq(definitions.kind, kind),
    eq(definitions.reference, reference),
    eq(definitions.version, version),
  ];

  if (scope) {
    const scopeCond = scopeCondition(scope);
    if (scopeCond) conditions.push(scopeCond);
  }

  const result = await db
    .select()
    .from(definitions)
    .where(and(...conditions))
    .get();

  return result ?? null;
}

/**
 * Finds a definition by reference and content hash (for deduplication).
 */
export async function getDefinitionByReferenceAndHash(
  db: DrizzleD1Database,
  kind: DefinitionKind,
  reference: string,
  contentHash: string,
  scope?: Scope,
): Promise<Definition | null> {
  const conditions = [
    eq(definitions.kind, kind),
    eq(definitions.reference, reference),
    eq(definitions.contentHash, contentHash),
  ];

  if (scope) {
    const scopeCond = scopeCondition(scope);
    if (scopeCond) conditions.push(scopeCond);
  }

  const result = await db
    .select()
    .from(definitions)
    .where(and(...conditions))
    .get();

  return result ?? null;
}

/**
 * Gets the maximum version number for a reference.
 */
export async function getMaxVersionByReference(
  db: DrizzleD1Database,
  kind: DefinitionKind,
  reference: string,
  scope?: Scope,
): Promise<number> {
  const conditions = [eq(definitions.kind, kind), eq(definitions.reference, reference)];

  if (scope) {
    const scopeCond = scopeCondition(scope);
    if (scopeCond) conditions.push(scopeCond);
  }

  const result = await db
    .select({ maxVersion: max(definitions.version) })
    .from(definitions)
    .where(and(...conditions))
    .get();

  return result?.maxVersion ?? 0;
}

/**
 * Lists definitions by kind with optional scope filtering.
 */
export async function listDefinitions(
  db: DrizzleD1Database,
  kind: DefinitionKind,
  options?: {
    projectId?: string;
    libraryId?: string;
    limit?: number;
    latestOnly?: boolean;
  },
): Promise<Definition[]> {
  const conditions: SQL[] = [eq(definitions.kind, kind)];

  if (options?.projectId) {
    conditions.push(eq(definitions.projectId, options.projectId));
  }

  if (options?.libraryId) {
    conditions.push(eq(definitions.libraryId, options.libraryId));
  }

  const limit = options?.limit ?? 100;

  if (options?.latestOnly) {
    // Subquery approach: get max version per reference, then filter
    // For now, fetch all and dedupe in memory (simpler for D1)
    const all = await db
      .select()
      .from(definitions)
      .where(and(...conditions))
      .orderBy(definitions.reference, desc(definitions.version))
      .all();

    // Keep only the first (latest) version per reference
    const seen = new Set<string>();
    const latest: Definition[] = [];
    for (const def of all) {
      const key = `${def.reference}:${def.projectId ?? ''}:${def.libraryId ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        latest.push(def);
        if (latest.length >= limit) break;
      }
    }
    return latest;
  }

  return await db
    .select()
    .from(definitions)
    .where(and(...conditions))
    .limit(limit)
    .all();
}

/**
 * Deletes a definition by id, optionally at a specific version.
 * If version is not specified, deletes all versions.
 */
export async function deleteDefinition(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  if (version !== undefined) {
    await db
      .delete(definitions)
      .where(and(eq(definitions.id, id), eq(definitions.version, version)))
      .run();
  } else {
    await db.delete(definitions).where(eq(definitions.id, id)).run();
  }
}

/**
 * Deletes all versions of a definition by kind and reference.
 */
export async function deleteDefinitionByReference(
  db: DrizzleD1Database,
  kind: DefinitionKind,
  reference: string,
  scope?: Scope,
): Promise<void> {
  const conditions = [eq(definitions.kind, kind), eq(definitions.reference, reference)];

  if (scope) {
    const scopeCond = scopeCondition(scope);
    if (scopeCond) conditions.push(scopeCond);
  }

  await db.delete(definitions).where(and(...conditions)).run();
}

// ============================================================================
// Reference Resolution
// ============================================================================

/**
 * Resolves a reference to a concrete definition.
 *
 * @param version - If null, resolves to latest. If specified, resolves to that version.
 */
export async function resolveReference(
  db: DrizzleD1Database,
  kind: DefinitionKind,
  reference: string,
  version: number | null,
  scope?: Scope,
): Promise<Definition | null> {
  if (version === null) {
    return getLatestDefinition(db, kind, reference, scope);
  }
  return getDefinitionByVersion(db, kind, reference, version, scope);
}

// ============================================================================
// AutoversionRepo Interface (for compatibility with existing Resource base class)
// ============================================================================

/**
 * Creates an AutoversionRepo adapter for use with the existing Resource.withAutoversion() method.
 * This allows gradual migration of existing RPC resources.
 */
export function createAutoversionRepo<K extends DefinitionKind>(
  db: DrizzleD1Database,
  kind: K,
) {
  return {
    async findByReferenceAndHash(
      reference: string,
      hash: string,
      scope?: Scope,
    ): Promise<Definition | null> {
      return getDefinitionByReferenceAndHash(db, kind, reference, hash, scope);
    },

    async getMaxVersion(reference: string, scope?: Scope): Promise<number> {
      return getMaxVersionByReference(db, kind, reference, scope);
    },
  };
}
