# Data Model

## D1 Schema

Core tables:

```
workspaces
projects
workflow_defs
workflows
workflow_runs
nodes              (workflow_def_id, id, ...)
transitions        (workflow_def_id, id, from_node_id, to_node_id, priority, ...)
actions
prompt_specs
model_profiles
artifacts
events
secrets
```

## Relationships

- `WorkflowDef` → many `NodeDef`, many `TransitionDef` (via `workflow_def_id`)
- `Workflow` → one `WorkflowDef` (via `workflow_def_id`), optionally pinned to version
- `WorkflowRun` → one `Workflow`, one `WorkflowDef` (snapshot version at run start)
- `NodeDef` → one `ActionDef` (via `action_id`)
- `ActionDef.llm_call` → one `PromptSpec`, one `ModelProfile`
- `Artifact` → one `ArtifactType`, scoped to `project_id`

## Loading Strategy

**At workflow run start:**

- Load `WorkflowDef` (by id + version)
- Load all `NodeDef` where `workflow_def_id = X`
- Load all `TransitionDef` where `workflow_def_id = X`
- Cache in DO memory for duration of run

**On-demand during execution:**

- Load `ActionDef` when node executes (cache in DO)
- Load `PromptSpec` for LLM calls (cache in DO)
- Load `ModelProfile` for LLM calls (cache in DO)
- Load `ArtifactType` for write_artifact (cache in DO)

**Never loaded into DO:**

- Full artifact content (reference by ID only, fetch in Worker)
- Historical events (written only, read for replay/debug via API)

## DO SQLite Storage

- Context mapped to relational schema: scalars as columns, arrays as tables
- SQLite validates types, constraints, foreign keys natively
- Single row per run, updated in place
- Ephemeral (run lifetime); snapshots to D1

## Event Storage

- Events buffered in DO SQLite, flushed to D1 in batches (per snapshot interval)
- Retention: 30 days in D1, then moved to R2 by scheduled Worker
- Query patterns: by `workflow_run_id` + `sequence_number` range for replay

## Snapshot Storage

- Snapshots stored in `workflow_runs.latest_snapshot` (JSONB column)
- Created per `ProjectSettings.snapshot_policy`
- Contains: `context`, `tokens`, `after_sequence_number`
- Recovery: load snapshot, replay events from `after_sequence_number + 1`

## Secrets

- Stored in D1 `secrets` table, encrypted at rest (Cloudflare Workers encryption)
- Keyed by `workspace_id` + `key` (e.g., provider API keys, MCP tokens)
- Never logged or included in events
- Injected into Worker environment variables at task execution time
