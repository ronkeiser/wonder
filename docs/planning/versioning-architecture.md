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

## Force Deploy Behavior

The `--force` flag changes how versioning works during deploy:

**Without `--force` (default):**
1. Compute content hash
2. Check if existing version has matching hash → reuse (skip creation)
3. If no match → increment version, create new entity

**With `--force`:**
1. Skip content hash check
2. Always increment version, even if content is identical
3. Create new entity with new `id`, same `reference`, higher `version`

This means `--force` = "force a new version", not "reset to version 1". Key properties:

- `reference` stays stable across all versions
- Old versions remain in the database
- No broken references—entities referencing by `reference` automatically resolve to latest
- Useful for forcing re-deploy when content hash is the same but you want a fresh version

## Referencing Other Entities

Entities reference each other by `reference` (stable identity), not by `id` (version-specific):

```typescript
// Persona references workflow by reference, not id
{
  reference: "core/my-persona",
  content: {
    contextAssemblyWorkflowRef: "core/context-assembly-passthrough",
    contextAssemblyWorkflowVersion: null, // null = latest, or pin to specific version
  }
}
```

At runtime, resolve `reference` + optional `version` to get the actual entity:
- If `version` is null → `getLatest(kind, reference, scope)`
- If `version` is specified → `getVersion(kind, reference, version, scope)`

This allows:
- **Development**: Leave version null, always get latest
- **Production**: Pin to specific version for stability

## Version Resolution for Conversations

Version resolution happens **once at conversation creation** and is stored on the conversation. This ensures conversations have stable, predictable behavior.

### Resolution Chain

1. **Agent** specifies `personaRef` + `personaVersion` (null = latest, or pinned)
2. **At conversation creation**, resolve to concrete persona version
3. **Persona** specifies workflow refs + versions (null = latest, or pinned)
4. **At conversation creation**, resolve those to concrete workflow versions
5. **Store the full resolved chain** on the conversation

```typescript
// Conversation stores resolved versions
{
  conversationId: "01ABC...",
  agentId: "01DEF...",

  // Resolved at creation time
  resolvedPersonaRef: "core/mega-man",
  resolvedPersonaVersion: 3,
  resolvedContextAssemblyWorkflowRef: "core/context-assembly-passthrough",
  resolvedContextAssemblyWorkflowVersion: 2,
  resolvedMemoryExtractionWorkflowRef: "core/memory-extraction",
  resolvedMemoryExtractionWorkflowVersion: 1,
}
```

### Properties

- **Conversations are immutable** — no mid-conversation version changes
- **Updates propagate to new conversations only** — existing conversations unaffected
- **Full traceability** — you can see exactly which versions each conversation uses
- **Safe rollouts** — deploy new versions without breaking existing conversations

### Optional: Refresh Command

For long-running conversations during development, consider a "refresh definitions" command that explicitly upgrades a conversation to the latest resolved versions. This should be a deliberate action, not automatic.

## Implementation Steps

1. Implement `definitions` table schema
2. Implement generic repository functions
3. Implement content validation with Zod schemas per kind
4. Remove old entity-specific tables and repositories
5. Update all consumers to use new unified interface
6. Change `--force` to increment version instead of resetting to 1
7. Update entity references to use `reference` instead of `id`
