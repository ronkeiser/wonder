# Unified Definitions Table Implementation Plan

## Overview

Migrate seven separate versioned entity tables into a single `definitions` table with a `kind` discriminator and JSON `content` column.

## Schema

```typescript
// /services/resources/src/schema/index.ts

export const definitions = sqliteTable(
  'definitions',
  {
    id: text().notNull(),
    version: integer().notNull().default(1),
    kind: text({
      enum: ['workflow_def', 'task', 'action', 'persona', 'prompt_spec', 'artifact_type', 'model_profile'],
    }).notNull(),
    reference: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    projectId: text().references(() => projects.id),
    libraryId: text().references(() => libraries.id),
    contentHash: text().notNull(),
    content: text({ mode: 'json' }).$type<object>().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    unique('unique_definitions_version').on(table.kind, table.reference, table.version, table.projectId, table.libraryId),
    unique('unique_definitions_content').on(table.kind, table.reference, table.contentHash, table.projectId, table.libraryId),
    index('idx_definitions_kind').on(table.kind),
    index('idx_definitions_reference').on(table.reference, table.kind),
    index('idx_definitions_scope').on(table.projectId, table.libraryId),
  ],
);
```

Update `nodes` and `transitions` FK columns from `workflowDefId`/`workflowDefVersion` to `definitionId`/`definitionVersion`.

## Normalization Decisions

1. **PromptSpecs/ArtifactTypes**: Currently use `name` as autoversion key. Normalize to `reference` — on create, if `autoversion=true` and no `reference`, set `reference = name`.

2. **ModelProfiles**: Currently not versioned (single `id` PK). Add versioning — version will always be 1 unless content changes.

## Implementation Order

### Phase 1: Schema
1. Add `definitions` table to `/services/resources/src/schema/index.ts`
2. Update `nodes` FK columns: `workflowDefId` → `definitionId`, `workflowDefVersion` → `definitionVersion`
3. Update `transitions` FK columns similarly
4. Keep old tables temporarily for reference

### Phase 2: Repository Layer
1. Create `/services/resources/src/shared/definitions-repository.ts`:
   - `createDefinition(db, kind, data)`
   - `getDefinition(db, id, version?)`
   - `getLatestDefinition(db, kind, reference, scope?)`
   - `getDefinitionByReferenceAndHash(db, kind, reference, contentHash, scope?)`
   - `getMaxVersionByReference(db, kind, reference, scope?)`
   - `listDefinitions(db, kind, options?)`
   - `deleteDefinition(db, id, version?)`

2. Create `/services/resources/src/shared/content-schemas.ts`:
   - Zod schemas for each `kind`'s content (excluding id, version, reference, name, description, scope, contentHash, timestamps)

3. Update `/services/resources/src/resources/workflow-defs/repository.ts`:
   - Update node/transition queries to use new FK column names

### Phase 3: RPC Resources (order by complexity)
1. **ArtifactTypes** — no scope, name-based → reference normalization
2. **PromptSpecs** — no scope, name-based → reference normalization
3. **ModelProfiles** — no scope, add versioning
4. **Actions** — no scope
5. **Tasks** — project|library scope
6. **Personas** — library-only scope
7. **WorkflowDefs** — project|library scope, sub-entities

Each resource class:
- Keeps existing public API (method signatures unchanged)
- Delegates to `definitions-repository` instead of entity-specific repository
- Maps `Definition` rows back to entity-specific types for return values

### Phase 4: Cleanup
1. Delete old entity-specific repository files (except workflow-defs for nodes/transitions)
2. Delete old table definitions from schema
3. Run `pnpm drizzle-kit generate` to create migration

### Phase 5: Downstream Updates
Update FK references in other tables that point to old entity tables:
- `workflows.workflowDefId` — no change needed (still points to id, which exists in definitions)
- `personas` fields that reference other definitions — update if needed

## Files to Modify

**New:**
- `/services/resources/src/shared/definitions-repository.ts`
- `/services/resources/src/shared/content-schemas.ts`

**Schema:**
- `/services/resources/src/schema/index.ts`

**RPC Resources:**
- `/services/resources/src/resources/artifact-types/index.ts`
- `/services/resources/src/resources/prompt-specs/index.ts`
- `/services/resources/src/resources/model-profiles/index.ts`
- `/services/resources/src/resources/actions/index.ts`
- `/services/resources/src/resources/tasks/index.ts`
- `/services/resources/src/resources/personas/index.ts`
- `/services/resources/src/resources/workflow-defs/index.ts`
- `/services/resources/src/resources/workflow-defs/repository.ts` (nodes/transitions only)

**Delete after migration:**
- `/services/resources/src/resources/artifact-types/repository.ts`
- `/services/resources/src/resources/prompt-specs/repository.ts`
- `/services/resources/src/resources/model-profiles/repository.ts`
- `/services/resources/src/resources/actions/repository.ts`
- `/services/resources/src/resources/tasks/repository.ts`
- `/services/resources/src/resources/personas/repository.ts`

## Verification

1. Run existing tests: `pnpm test` in `/packages/tests`
2. Deploy to dev and run CLI deploy to create definitions
3. Verify workflow execution reads definitions correctly
4. Verify autoversion deduplication works (deploy same content twice, should reuse)