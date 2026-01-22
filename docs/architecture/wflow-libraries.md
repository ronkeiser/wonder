# Wflow Libraries and Deployment

## Overview

Wonder definitions (workflows, tasks, actions, personas, agents, tools, models) are authored as local YAML files and deployed to the platform via CLI. The `wflow deploy` command syncs local definitions to D1 through the SDK.

## Directory Structure

Convention-based structure with the workspace root as the organizing principle:

```
workspace/
├── wflow.config.yaml        # optional root config for overrides
├── personas/
│   └── assistant.persona
├── agents/
│   └── code-reviewer.agent
├── libraries/
│   └── core/
│       ├── write-file.task
│       ├── react-reasoning.wflow
│       ├── llm-call.action
│       ├── shell-exec.tool
│       └── claude-sonnet.model
└── projects/
    ├── backend-rewrite/
    │   └── deploy-feature.wflow
    └── ml-platform/
        └── train-model.wflow
```

Directory names encode identity:
- `personas/` — workspace-scoped persona definitions (flat, no subdirectories)
- `agents/` — workspace-scoped agent definitions (flat, no subdirectories)
- `libraries/{name}/` — named library (flat, no nested subdirectories within a library)
- `projects/{name}/` — named project

## File Types

| Extension | Description | Location |
|-----------|-------------|----------|
| `.wflow` | Workflow graph (nodes + transitions) | `libraries/` or `projects/` |
| `.task` | Linear step sequence | `libraries/` |
| `.action` | Atomic operation (llm, mcp, http, shell, context, etc.) | `libraries/` |
| `.tool` | Tool wrapper for agent use | `libraries/` |
| `.model` | Model profile (provider, parameters, pricing) | `libraries/` |
| `.persona` | Agent template (system prompt, tools, workflows) — stateless | `personas/` |
| `.agent` | Agent instance (persona + project bindings) — accumulates memory | `agents/` |
| `.test` | Test suite with mocks and assertions | anywhere |

## YAML Conventions

All wflow files use snake_case for field names:

```yaml
# Example persona file
name: assistant
description: General-purpose assistant
system_prompt: |
  You are a helpful assistant.
model_profile_id: core/claude-sonnet
context_assembly_workflow_def_id: core/context-assembly-passthrough
memory_extraction_workflow_def_id: core/memory-extraction-noop
tool_ids: []
recent_turns_limit: 10
```

The parser converts snake_case to camelCase for TypeScript consumption.

## Reference Syntax

Definitions reference other definitions using explicit scope prefixes:

| Syntax | Scope | Example |
|--------|-------|---------|
| `library/name` | Standard library (global, provided by Wonder) | `core/context-assembly-passthrough` |
| `$library/name` | Workspace library (user-defined) | `$my-lib/custom-task` |
| `@project/name` | Project scope | `@backend-rewrite/deploy-feature` |
| `name` | Workspace scope (personas, agents) | `assistant` |

**Standard Library**: The standard library is a global scope available to all workspaces. It provides common tools, tasks, and workflows (like context assembly and memory extraction) that workspaces can reference without defining themselves.

Example references in a persona:
```yaml
model_profile_id: core/claude-sonnet              # standard library
context_assembly_workflow_def_id: core/context-assembly-passthrough
tool_ids:
  - core/shell-exec                               # standard library
  - $my-lib/custom-tool                           # workspace library
```

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
4. Resolves references and computes dependency order
5. Sends definitions to the API in topological order

## Identity and Versioning

**Identity**: Each definition has a ULID (primary key). The composite key `(scope, name)` is used for lookup, derived from directory structure and filename.

- `libraries/core/write-file.task` → library `core`, name `write-file`
- `projects/backend-rewrite/deploy-feature.wflow` → project `backend-rewrite`, name `deploy-feature`
- `personas/assistant.persona` → workspace scope, name `assistant`

**Versioning**: Hash-based auto-versioning on the server. Each version is immutable.

1. CLI sends definition with name (derived from filename)
2. Server computes content hash
3. Server looks up existing definition by `(scope, name)`, gets its ULID
4. If no match → create definition with new ULID, version 1
5. If match and hash differs → create new version under same definition
6. If match and hash identical → no-op (idempotent)

Definitions do not embed version numbers. The server manages version history.

## Name Uniqueness

Names must be unique within their scope:
- Task/action/workflow/tool/model names unique within a library
- Workflow names unique within a project
- Persona names unique within workspace
- Agent names unique within workspace

Different libraries can have definitions with the same name — the library is part of the identity.

## Scope Hierarchy

```
Standard Library (global, provided by Wonder)
└── core/ (workflows, tasks, actions, tools, models)

Workspace
├── Personas (workspace-scoped)
├── Agents (workspace-scoped, reference personas)
├── Libraries (workspace-scoped, user-defined)
│   └── Definitions referenced by $library/name
└── Projects
    └── Workflows referenced by @project/name
```

**Standard library**: Global scope available to all workspaces. Contains common building blocks.

**Workspace libraries**: User-defined reusable definitions. Referenced with `$library/name`.

**Project workflows**: Workflows bound to a project with triggers (webhook, schedule, event). Execute within project context.

**Agents**: Reference a persona and specify which projects they can access. Not bound to a single project. Unlike personas, agents are stateful — they accumulate memory across conversations via the memory extraction workflow. Different agents from the same persona build up different memories.

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

### wflow check

Validate files locally without deploying.

```bash
# Check all files in current directory
wflow check

# Check with cross-file reference validation
wflow check --workspace

# Treat warnings as errors
wflow check --strict

# Output as JSON
wflow check --format=json
```

### wflow deploy

Push local definitions to the server.

```bash
# Deploy everything from current directory
wflow deploy

# Deploy specific subtree
wflow deploy ./libraries/core

# Deploy single file
wflow deploy ./libraries/core/write-file.task

# Dry run — show what would be deployed
wflow deploy --dry-run

# Deploy to specific workspace (overrides config)
wflow deploy --workspace-id=my-workspace-id

# Force deploy even if server has newer version
wflow deploy --force
```

**Conflict detection**: On deploy, the CLI compares content hashes. If the server has a newer version, deploy fails unless `--force` is specified.

### wflow pull

Fetch definitions from the server to local files.

```bash
# Pull all definitions for workspace
wflow pull

# Pull specific library
wflow pull ./libraries/core
```

Writes server state to local files following directory conventions.

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

### wflow test

Run test files against the API.

```bash
# Run all tests
wflow test

# Run specific test file
wflow test ./tests/my-workflow.test

# Filter by pattern
wflow test --filter "context-assembly"

# Run in parallel
wflow test --parallel --max-concurrent=4
```

## CLI Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  WorkspaceLoader                                            │
│  1. Discover files from directory structure                 │
│  2. Parse each file → AST document                          │
│  3. Infer (scope, name) from path                           │
│  4. Compute content hash for each definition                │
│  5. Build reference map: (scope, name) → document           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  WorkspaceValidator                                         │
│  1. Resolve references against workspace + standard library │
│  2. Report unresolved references as diagnostics             │
│  3. Detect cycles in dependency graph                       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│  wflow check            │     │  wflow deploy               │
│  Report diagnostics     │     │  1. Topological sort        │
│  Exit with status code  │     │  2. Create via API in order │
└─────────────────────────┘     │  3. Capture ULIDs           │
                                │  4. Use ULIDs for dependents│
                                └─────────────────────────────┘
```

## Tooling

The `@wonder/wflow` package (core) provides:
- **Parser**: Parses all file types, handles snake_case → camelCase conversion
- **Analyzer**: Graph analysis, data flow analysis, schema validation
- **Workspace**: Reference resolution, dependency ordering

The `@wonder/wflow-cli` package provides:
- `wflow check` — validate workspace locally
- `wflow test` — run `.test` files against the API
- `wflow deploy` — sync local definitions to server
- `wflow diff` — compare local vs server state
- `wflow pull` — fetch definitions from server

The `@wonder/wflow-lsp` package provides:
- IDE support with diagnostics, completions, hover, go-to-definition

## Multi-Interface Editing

Definitions can be edited through multiple interfaces:
- **CLI**: Local files, deployed via `wflow deploy`
- **Dashboard**: Visual editor in the web UI
- **SDK**: Programmatic access via HTTP API

All interfaces write to the same server state. Use `wflow pull` to sync server changes to local files, and `wflow diff` to see divergence before deploying.

## Design Principles

1. **Convention over configuration**: Directory structure encodes identity
2. **Explicit scopes**: References use prefixes to indicate scope unambiguously
3. **Snake_case in YAML**: Human-readable format, converted to camelCase for code
4. **Idempotent deploys**: Same content → same result
5. **Server-managed versioning**: CLI declares desired state, server handles versions
6. **Immutable versions**: Once created, a version's content cannot change
7. **Conflict-aware**: Deploy fails if server has diverged
8. **Multi-interface**: CLI, dashboard, and SDK are equal citizens
