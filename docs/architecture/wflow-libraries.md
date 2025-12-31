# Wflow Libraries and Deployment

## Overview

Wonder definitions (workflows, tasks, actions, personas, agents) are authored as local files and deployed to the platform via CLI. The `wflow deploy` command syncs local definitions to D1 through the SDK.

## Directory Structure

Convention-based structure with the workspace root as the organizing principle:

```
workspace/
├── wflow.config.yaml        # optional root config for overrides
├── personas/
│   └── code_assistant.persona
├── agents/
│   └── reviewer.agent
├── libraries/
│   ├── core/
│   │   ├── write_file.task
│   │   ├── react_reasoning.wflow
│   │   └── llm_call.action
│   └── experimental/
│       └── new_thing.task
└── projects/
    ├── backend-rewrite/
    │   └── deploy_feature.wflow
    └── ml-platform/
        └── train_model.wflow
```

Directory names encode identity:
- `libraries/{name}/` — library name
- `projects/{name}/` — project name
- `personas/` and `agents/` — workspace-scoped

## File Types and Deploy Targets

| File Extension | Deploy Target | Scope |
|----------------|---------------|-------|
| `.wflow` | Library (reusable) or Project (bound with triggers) | Depends on location |
| `.task` | Library | Library |
| `.action` | Library | Library |
| `.persona` | Library | Workspace |
| `.agent` | Workspace | Workspace (can access multiple projects) |

## Deploy Flow

```
Local files
    ↓ parse + validate (wflow core)
wflow deploy
    ↓ SDK HTTP calls
API endpoint (Workers)
    ↓ service bindings / RPC
D1 writes
```

The CLI:
1. Walks the directory tree from the specified path
2. Infers deploy target from directory structure
3. Parses and validates each file
4. Sends definitions to the API via SDK

## Identity and Versioning

**Identity**: Each definition has a ULID (primary key). The composite key `(library or project, name)` is used for lookup, derived from directory structure and filename.

- `libraries/core/write_file.task` → library `core`, name `write_file`
- `projects/backend-rewrite/deploy_feature.wflow` → project `backend-rewrite`, name `deploy_feature`

**Versioning**: Hash-based auto-versioning on the server. Each version is immutable.

1. CLI sends definition with name (derived from filename)
2. Server computes content hash
3. Server looks up existing definition by `(target, name)`, gets its ULID
4. If no match → create definition with new ULID, version 1
5. If match and hash differs → create new version (new ULID) under same definition
6. If match and hash identical → no-op (idempotent)

Definitions do not embed version numbers. The server manages version history. Once a version is created, its content cannot be modified (immutability enforced by resources service).

## Name Uniqueness

Names must be unique within their scope:
- Task/action/workflow names unique within a library
- Workflow names unique within a project
- Persona names unique within workspace
- Agent names unique within workspace

Different libraries can have definitions with the same name — the library is part of the identity.

## Scope Hierarchy

```
Workspace
├── Personas (workspace-scoped, reusable definitions)
├── Agents (workspace-scoped, can access multiple projects)
├── Libraries (contain reusable workflows, tasks, actions)
│   └── Definitions referenced by (library, name, version)
└── Projects (contain bound workflows with triggers)
    └── Workflows reference library definitions
```

**Library definitions**: Reusable building blocks. Workflows, tasks, actions, personas live here. Referenced by ID, optionally pinned to version.

**Project workflows**: Library workflows bound to a project with triggers (webhook, schedule, event). Execute within project context with access to project resources.

**Agents**: Workspace-scoped. Reference a persona (from library) and specify which projects they can access. Not bound to a single project.

## Configuration

The root `wflow.config.yaml` is optional. It overrides conventions when needed:

```yaml
# Override default directory names
directories:
  libraries: lib
  projects: proj
  personas: personas
  agents: agents

# Specify workspace (for deploy target)
workspace: my-workspace-id
```

Default behavior requires no configuration — directory structure encodes everything.

## CLI Commands

### wflow deploy

Push local definitions to the server.

```bash
# Deploy everything from current directory
wflow deploy

# Deploy specific subtree
wflow deploy ./libraries/core

# Deploy single file
wflow deploy ./libraries/core/write_file.task

# Dry run — show what would be deployed
wflow deploy --dry-run

# Deploy to specific workspace (overrides config)
wflow deploy --workspace=my-workspace-id

# Force deploy even if server has newer version
wflow deploy --force
```

**Conflict detection**: On deploy, the CLI queries the server to compare the local file's content hash against the current version. If the server has a newer version (someone edited via dashboard or SDK), deploy fails unless `--force` is specified. This prevents accidentally overwriting changes made through other interfaces.

### wflow pull

Fetch definitions from the server to local files.

```bash
# Pull all definitions for workspace
wflow pull

# Pull specific library
wflow pull ./libraries/core

# Pull and overwrite local files (default behavior)
wflow pull --force
```

Writes server state to local files following directory conventions. Useful when definitions were edited via dashboard or SDK and you want local files to reflect current state.

### wflow diff

Show differences between local files and server state.

```bash
# Diff all definitions
wflow diff

# Diff specific subtree
wflow diff ./libraries/core

# Output as JSON
wflow diff --format=json
```

Compares local files against current server state. Shows:
- Local changes not yet deployed
- Server changes not yet pulled
- Definitions that exist only locally or only on server

## Relationship to Existing Tooling

The `@wonder/wflow` package already provides:
- **Parser**: Parses `.wflow`, `.task`, `.action`, `.test`, `.run` files
- **Analyzer**: Graph analysis, data flow analysis, schema validation
- **LSP**: IDE support with diagnostics, completions, hover, go-to-definition

The `@wonder/wflow-cli` currently supports:
- `wflow test` — run `.test` files against the API
- `wflow check` — validate files locally

The `wflow deploy` command extends this with sync/deploy functionality.

## Multi-Interface Editing

Definitions can be edited through multiple interfaces:
- **CLI**: Local files, deployed via `wflow deploy`
- **Dashboard**: Visual editor in the web UI
- **SDK**: Programmatic access via HTTP API

All interfaces write to the same server state. The CLI is not the sole source of truth—it's one way to manage definitions. Use `wflow pull` to sync server changes to local files, and `wflow diff` to see divergence before deploying.

## Design Principles

1. **Convention over configuration**: Directory structure is the primary source of truth for local files
2. **Files are portable**: No library/project embedded in file content
3. **Idempotent deploys**: Same content → same result, no side effects
4. **Server-managed versioning**: CLI declares desired state, server handles versions
5. **Immutable versions**: Once created, a version's content cannot change
6. **Conflict-aware**: Deploy fails if server has diverged, preventing accidental overwrites
7. **Multi-interface**: CLI, dashboard, and SDK are equal citizens for editing definitions