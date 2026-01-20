# Wflow Workspace Commands Implementation Plan

## Design Decisions

### Reference Syntax

| Reference Syntax | Scope | Example |
|------------------|-------|---------|
| `name` | Workspace | `code-assistant` (persona), `reviewer` (agent) |
| `library/name` | Standard Library | `core/shell-exec` (tool), `git/commit` (action) |
| `$library/name` | Workspace Library | `$mylib/utils` (task), `$internal/helpers` (workflow) |
| `@project/name` | Project | `@backend/deploy` (workflow) |

Standard libraries (`workspaceId = null`) are platform-provided and available to all workspaces. Workspace libraries (`$` prefix) are user-created within a workspace.

### Directory Structure

```
workspace/
├── wflow.config.yaml          # optional overrides
├── personas/
│   └── code-assistant.persona
├── agents/
│   └── reviewer.agent
├── libraries/
│   └── mylib/                 # becomes $mylib/...
│       ├── utils.task
│       ├── helpers.wflow
│       └── custom-tool.tool
└── projects/
    └── backend/
        └── deploy.wflow
```

Local `libraries/` directories are **workspace libraries** (referenced as `$library/name`). Standard libraries are platform-provided and not present locally — references like `core/shell-exec` resolve against the server.

### Scope Rules

- **Personas, Agents**: Workspace-scoped, flat namespace, unqualified references
- **Standard Library Definitions**: `library/name` (no prefix)
- **Workspace Library Definitions**: `$library/name`
- **Project Workflows**: `@project/name`

### API Model

Libraries are first-class resources:
- `POST /libraries` creates a library
- `workspaceId: string | null` — null for standard libraries, ULID for workspace libraries
- Definitions reference `libraryId` (ULID)
- Server enforces name uniqueness within library
- Hierarchy: Workspace → Library → Definition

Deploy order:
1. Create/resolve library by name within workspace
2. Create definitions within library

---

## Implementation

### Phase 1: Core Infrastructure

#### 1.1 Reference Parser (`packages/wflow/core/src/workspace/reference.ts`)

Parse reference strings into structured form:

```typescript
type Reference =
  | { scope: 'workspace'; name: string }
  | { scope: 'standardLibrary'; library: string; name: string }
  | { scope: 'workspaceLibrary'; library: string; name: string }
  | { scope: 'project'; project: string; name: string }

function parseReference(ref: string): Reference
function formatReference(ref: Reference): string
```

Parsing rules:
- `name` → workspace scope
- `library/name` (no prefix) → standard library
- `$library/name` → workspace library
- `@project/name` → project

#### 1.2 Workspace Loader (`packages/wflow/core/src/workspace/loader.ts`)

Walk directory tree, parse files, build reference map:

```typescript
interface WorkspaceDefinition {
  reference: Reference
  filePath: string
  fileType: FileType  // 'workflow' | 'task' | 'action' | 'tool' | 'persona' | 'agent'
  document: Document  // parsed AST
  contentHash: string
}

interface Workspace {
  root: string
  definitions: Map<string, WorkspaceDefinition>  // keyed by formatted reference
  config?: WorkspaceConfig
}

async function loadWorkspace(rootPath: string): Promise<Workspace>
```

The loader:
1. Finds `wflow.config.yaml` if present
2. Walks `personas/`, `agents/`, `libraries/`, `projects/`
3. Parses each definition file
4. Computes content hash (for idempotency)
5. Builds reference map

#### 1.3 Workspace Validator (`packages/wflow/core/src/workspace/validator.ts`)

Validate cross-file references:

```typescript
interface StandardLibraryManifest {
  libraries: Map<string, Set<string>>  // library name -> definition names
}

interface ValidationResult {
  valid: boolean
  diagnostics: Diagnostic[]
  dependencyGraph: Map<string, string[]>  // reference -> references it depends on
}

function validateWorkspace(
  workspace: Workspace,
  standardLibrary: StandardLibraryManifest
): ValidationResult
```

The validator:
1. For each definition, extract references (toolIds, workflowId, etc.)
2. Resolve each reference:
   - Workspace scope (`name`) → workspace map
   - Workspace library (`$lib/name`) → workspace map
   - Standard library (`lib/name`) → standard library manifest
   - Project (`@proj/name`) → workspace map
3. Report unresolved references as errors
4. Build dependency graph
5. Detect cycles

The CLI fetches the standard library manifest from the server before validation.

#### 1.4 Dependency Ordering (`packages/wflow/core/src/workspace/ordering.ts`)

Topological sort for deploy order:

```typescript
function getDeployOrder(workspace: Workspace, validation: ValidationResult): WorkspaceDefinition[]
```

---

### Phase 2: CLI Commands

#### 2.1 `wflow check` Enhancement (`packages/wflow/cli/src/commands/check.ts`)

Currently validates individual files. Enhance to:
- When given a directory, load as workspace
- Validate cross-file references
- Report workspace-level diagnostics

#### 2.2 `wflow deploy` (`packages/wflow/cli/src/commands/deploy.ts`)

```bash
wflow deploy [path] [--dry-run] [--force] [--workspace=id]
```

Implementation:
1. Load workspace from path
2. Validate (fail if errors)
3. Get deploy order (topological sort)
4. For each definition in order:
   - Check server for existing definition by (scope, name)
   - Compare content hash
   - If unchanged: skip (idempotent)
   - If server has different hash and no `--force`: fail with conflict
   - Otherwise: create/update via SDK, capture ULID
5. Use captured ULIDs when creating dependent definitions

#### 2.3 `wflow pull` (`packages/wflow/cli/src/commands/pull.ts`)

```bash
wflow pull [path] [--force]
```

Implementation:
1. Fetch all definitions from server for workspace
2. For each definition:
   - Compute local path from reference
   - Write file content (YAML with snake_case)
3. Handle conflicts (local changes) unless `--force`

#### 2.4 `wflow diff` (`packages/wflow/cli/src/commands/diff.ts`)

```bash
wflow diff [path] [--format=pretty|json]
```

Implementation:
1. Load local workspace
2. Fetch server state
3. Compare by content hash
4. Report: local-only, server-only, modified

---

### Phase 3: API — Library Resource

Add `/libraries` endpoint for workspace libraries:

```
POST   /libraries              - Create library in workspace
GET    /libraries              - List libraries (filter by workspaceId)
GET    /libraries/{id}         - Get library
DELETE /libraries/{id}         - Delete library
```

Add `/standard-library` endpoint for standard libraries (read-only):

```
GET    /standard-library                    - List all standard libraries
GET    /standard-library/manifest           - Get manifest (for validation)
GET    /standard-library/{library}          - List definitions in a library
GET    /standard-library/{library}/{name}   - Get specific definition
```

Library schema:
```typescript
{
  id: string               // ULID
  workspaceId: string | null  // null = standard library
  name: string             // unique within workspace (or globally for standard)
  createdAt: string
  updatedAt: string
}
```

Standard library manifest schema (for validation):
```typescript
{
  libraries: {
    [libraryName: string]: {
      definitions: {
        [name: string]: 'workflow' | 'task' | 'action' | 'tool'
      }
    }
  }
}
```

Update definition schemas to reference `libraryId` (ULID) instead of string.

---

### Phase 4: SDK Updates

Add to `@wonder/sdk`:
- `client.libraries.create()`, `.list()`, `(id).get()`, `(id).delete()`
- `client.standardLibrary.list()`, `.manifest()`, `(library).list()`, `(library)(name).get()`
- Query params for filtering definitions by `libraryId`, `projectId`
- Lookup by `(scope, name)` — e.g., `GET /tools?libraryId=X&name=Y`

---

## Files to Create/Modify

### API (packages/resources)
- Add library resource (schema, service, routes)
- Add standard-library routes (read-only)
- Update definition schemas to use `libraryId` ULID reference

### Documentation
- Update `docs/architecture/wflow-libraries.md` with new reference syntax

### wflow Core (packages/wflow/core)
- `src/workspace/reference.ts` - parse/format references
- `src/workspace/loader.ts` - walk directory, build reference map
- `src/workspace/validator.ts` - cross-file reference validation
- `src/workspace/ordering.ts` - topological sort for deploy
- `src/workspace/index.ts` - exports
- `src/index.ts` - export workspace module

### wflow CLI (packages/wflow/cli)
- `src/commands/deploy.ts` - new command
- `src/commands/pull.ts` - new command
- `src/commands/diff.ts` - new command
- `src/commands/check.ts` - enhance for workspace validation
- `src/index.ts` - register new commands

### SDK (packages/sdk)
- Regenerate client after API changes
- Add query param support for filtering

---

## Verification

1. Create test workspace structure with cross-references
2. Run `wflow check` on workspace - verify reference validation works
3. Run `wflow deploy --dry-run` - verify deploy order is correct
4. Run `wflow deploy` against local/dev API - verify definitions created
5. Run `wflow diff` - verify it shows no changes after deploy
6. Modify a local file, run `wflow diff` - verify it shows the change
7. Run `wflow pull` in empty directory - verify files created with correct structure