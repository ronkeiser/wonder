# Workflow Definition Deduplication

## Problem

The test helper creates a new workflow_def on every test run, even when the definition hasn't changed. Combined with test cleanup deleting workflows (but not workflow_runs), this causes:

1. Orphaned workflow_runs that reference deleted workflows
2. The `listWorkflowRuns` query with `INNER JOIN` excludes these runs
3. Recent test runs don't appear in the sidebar

## Solution

Add content-based deduplication to workflow_def creation using fingerprinting.

### Fingerprint Computation

1. Extract content fields from `WorkflowDefInput`:
   - `nodes` (refs, task mappings, input/output mappings)
   - `transitions` (conditions, from/to refs, spawn_count, synchronization)
   - `input_schema`, `output_schema`, `output_mapping`
   - `initial_node_ref`

2. Exclude from fingerprint:
   - `id`, `version`, timestamps
   - `name`, `description` (cosmetic - same content with different name = different def)

3. Canonicalize to sorted JSON, compute SHA-256 hash

### Schema Change

Add `content_hash` column to `workflow_defs` table:

```sql
ALTER TABLE workflow_defs ADD COLUMN content_hash TEXT;
CREATE INDEX idx_workflow_defs_hash ON workflow_defs(name, project_id, content_hash);
```

### API Change

Add `autoversion?: boolean` flag to `WorkflowDefs.create()`:

```typescript
interface WorkflowDefInput {
  // ... existing fields
  autoversion?: boolean;  // Enable content-based deduplication
}
```

### Creation Logic (when `autoversion: true`)

1. Compute fingerprint from input content
2. Query for existing workflow_def with same `name` + `project_id` + `content_hash`
3. If found → return existing (skip creation)
4. If not found but same name exists → create with `version = max(version) + 1`
5. If name doesn't exist → create with `version = 1`

### Files to Modify

1. **Schema**: `services/resources/src/schema/index.ts` - add `content_hash` column
2. **New file**: `services/resources/src/resources/workflow-defs/fingerprint.ts` - hash utility
3. **Repository**: `services/resources/src/resources/workflow-defs/repository.ts`:
   - `getWorkflowDefByNameAndHash(db, name, project_id, hash)`
   - `getMaxVersionByName(db, name, project_id)`
   - Update `createWorkflowDefWithId` to accept `content_hash` and `version`
4. **Resource**: `services/resources/src/resources/workflow-defs/index.ts` - autoversion logic
5. **Test helper**: `packages/tests/src/kit/workflow.ts` - pass `autoversion: true`

### Migration

Run schema migration to add `content_hash` column. Existing workflow_defs will have `NULL` hash (they won't participate in deduplication until recreated).

### Test Cleanup Changes

With deduplication in place, modify `cleanupWorkflowTest` to only delete:
- `workflow_run` (ephemeral, one per test execution)

Skip deleting (persist across test runs):
- `workflow`, `workflow_def`, `task_defs`, `actions`, `prompt_specs`
- `model_profile`, `project`, `workspace`

This requires a persistent test workspace/project configured via environment or created once.
