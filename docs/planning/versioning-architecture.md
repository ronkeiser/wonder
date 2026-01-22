# Versioning Architecture

## Overview

A single `definitions` table handles versioning for all entity types: WorkflowDefs, Tasks, Actions, Personas, PromptSpecs, ArtifactTypes, and ModelProfiles.

## Versioning Model

- `reference` — stable identifier across versions, passed in when `autoversion=true`
- `version` — integer, incremented when content changes
- `contentHash` — fingerprint of content, used for deduplication
- `content` — JSON blob containing entity-specific fields (including `name`)
- `kind` — discriminator for entity type

Versioning identity is `reference + scope`. The `name` field is part of content, not identity — changing the name produces a new version.

## Schema

```typescript
export const definitions = pgTable('definitions', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'workflow_def' | 'task' | 'action' | 'persona' | 'prompt_spec' | 'artifact_type' | 'model_profile'
  reference: text('reference').notNull(),
  version: integer('version').notNull(),
  contentHash: text('content_hash').notNull(),
  content: jsonb('content').notNull(),

  // Scope
  projectId: text('project_id').references(() => projects.id),
  libraryId: text('library_id').references(() => libraries.id),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueVersion: unique().on(table.reference, table.version, table.projectId, table.libraryId),
  uniqueContent: unique().on(table.reference, table.contentHash, table.projectId, table.libraryId),
  kindIdx: index('definitions_kind_idx').on(table.kind),
  referenceIdx: index('definitions_reference_idx').on(table.reference),
  scopeIdx: index('definitions_scope_idx').on(table.projectId, table.libraryId),
}));
```

## Content Validation

Each `kind` has a Zod schema. Validation happens at the repository layer before insert:

```typescript
const contentSchemas = {
  workflow_def: workflowDefContentSchema,
  task: taskContentSchema,
  action: actionContentSchema,
  persona: personaContentSchema,
  prompt_spec: promptSpecContentSchema,
  artifact_type: artifactTypeContentSchema,
  model_profile: modelProfileContentSchema,
} as const;

function validateContent(kind: DefinitionKind, content: unknown) {
  return contentSchemas[kind].parse(content);
}
```

## Repository Interface

Generic functions for all versioned entities:

- `create(kind, reference, content, scope)` — validates content, computes hash, determines version
- `getLatest(kind, reference, scope)` — returns highest version
- `getVersion(kind, reference, version, scope)` — returns specific version
- `getByReferenceAndHash(kind, reference, contentHash, scope)` — deduplication lookup
- `getMaxVersionByReference(kind, reference, scope)` — returns max version number
- `delete(id, version?)` — removes specific version or all versions

Entity-specific queries (e.g., `listActionsByKind`) use JSON operators on the `content` column.

## Migration

Wipe existing data and repopulate with new schema.

## Implementation Steps

1. Implement `definitions` table schema
2. Implement generic repository functions
3. Implement content validation with Zod schemas per kind
4. Remove old entity-specific tables and repositories
5. Update all consumers to use new unified interface
