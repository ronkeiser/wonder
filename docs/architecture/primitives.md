# Primitives

Core data types in the Wonder workflow system, organized by storage layer and managing service.

## Storage Architecture

**D1 (Resources Service)** - Tenant-scoped metadata, workflow definitions, versioned across workspace  
**D1 (Source Service)** - Git refs, artifact index  
**DO SQLite (Coordinator)** - Per-run execution state, isolated per workflow_run_id  
**Events Service** - Observability layer (D1 + Analytics Engine), permanent audit trail  
**Logs Service** - Operational logs (D1 → R2 archive), ephemeral debugging  
**R2** - Git objects, dependency cache, large files  
**Vectorize** - Semantic search indexes

## Hierarchy & Tenant Isolation

### Workspace

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  name: string;
  created_at: string; // ISO 8601
  updated_at: string;
}
```

Top-level tenant boundary. All resources (projects, libraries, workflows) belong to a workspace. Each workspace has isolated billing, settings, and access control.

**Settings** (stored in `workspace_settings` table):

- `allowed_model_providers`: LLM provider whitelist
- `allowed_mcp_servers`: MCP server whitelist
- `budget.max_monthly_spend_cents`: Spending cap
- `budget.alert_threshold_cents`: Alert threshold

---

### Project

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  workspace_id: string; // FK → workspaces
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}
```

Execution context for workflows. Projects provide:

- Runtime environment (model profiles, rate limits)
- Workflow runs (execution instances)
- State storage (DO coordination per run)
- Repos (code and artifacts)

**Settings** (stored in `project_settings` table):

- `default_model_profile_id`: Default LLM profile
- `rate_limits.max_concurrent_runs`: Concurrency limit
- `rate_limits.max_llm_calls_per_hour`: LLM throttling
- `budget`: Project-level spending caps
- `snapshot_policy`: Context snapshot frequency

---

### Library

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  workspace_id: string | null; // null = public/global library
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}
```

Reusable collection of workflow definitions, task definitions, and actions. Libraries enable:

- Sharing workflows across projects
- Versioned, immutable definitions
- Public libraries (when `workspace_id` is null)
- Project-type conventions (e.g., typescript-pnpm-monorepo)

---

### Repo

**Storage:** D1 (Resources) for metadata; R2 + D1 (Source Service) for content  
**Schema:**

```typescript
{
  id: string; // ULID
  project_id: string; // FK → projects
  name: string;
  type: 'code' | 'artifacts'; // Distinguishes source code from project documents
  default_branch: string; // Default: "main"
  created_at: string;
  updated_at: string;
}
```

Repository metadata. Each project has one or more code repos and exactly one artifacts repo (auto-created with project).

**Type distinction:**

- `code`: Source code repositories with working branches for workflow runs
- `artifacts`: Project documents (decisions, research, reports) with artifact type validation

**Content storage:** Git objects (blobs, trees, commits) in R2, refs (branches, tags) in D1. Managed by Source service. See [Source Hosting](./source-hosting.md).

---

### Ref

**Storage:** D1 (Source Service)  
**Schema:**

```typescript
{
  id: string; // ULID
  repo_id: string; // FK → repos
  name: string; // e.g., "refs/heads/main", "refs/tags/v1.0.0"
  target_sha: string; // Commit SHA this ref points to
  type: 'branch' | 'tag';
  updated_at: string;
  created_at: string;
}
```

Git references (branches and tags) stored in D1 for fast lookups. Updated on push operations.

**Reference format:**

- Branches: `refs/heads/{branch_name}` (e.g., `refs/heads/main`, `refs/heads/wonder/run-abc123`)
- Tags: `refs/tags/{tag_name}` (e.g., `refs/tags/v1.0.0`)

**Operations:**

- `updateRef(repo_id, name, old_sha, new_sha)`: Optimistic concurrency via CAS (compare-and-swap)
- `getRefs(repo_id, prefix)`: List all refs matching prefix
- `deleteRef(repo_id, name)`: Remove ref (e.g., cleanup working branches)

---

### GitObject

**Storage:** R2 (Source Service)  
**Key:** `git-objects/{repo_id}/{sha}`  
**Schema:**

```typescript
{
  sha: string; // Git object hash (40-char hex)
  type: 'blob' | 'tree' | 'commit'; // Git object type
  size: number; // Bytes
  data: Uint8Array; // Raw git object content (compressed)
}
```

Git objects stored in R2 for durable, versioned content. Immutable once written (content-addressed storage).

**Object types:**

- `blob`: File content
- `tree`: Directory listing (name → SHA mappings)
- `commit`: Commit metadata (parent, tree, author, message)

**Access patterns:**

- `getObject(repo_id, sha)`: Fetch single object
- `putObject(repo_id, sha, type, data)`: Write object (idempotent)
- `fetch(repo_id, ref)`: Recursive fetch all objects reachable from ref
- `push(repo_id, objects[])`: Batch write objects + update ref

---

## Workflow Definitions

### WorkflowDef

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;               // ULID (unique per definition)
  version: number;          // Incremental version
  name: string;
  description: string;

  // Ownership (exactly one)
  project_id: string | null;    // Local to project
  library_id: string | null;    // In reusable library

  tags: string[];           // Discovery/categorization

  input_schema: JSONSchema;     // Workflow input validation
  output_schema: JSONSchema;    // Workflow output validation
  context_schema: JSONSchema;   // Runtime context structure

  resources: Record<string, ResourceDeclaration> | null;  // Container declarations
  accepts_resources: Record<string, { type: 'container' }> | null;  // Required resources (for sub-workflows)

  initial_node_id: string;      // Starting node ULID

  timeout_ms: number | null;    // Max workflow duration (catches infinite loops, runaway fan-out)
  on_timeout: 'human_gate' | 'fail' | 'cancel_all';  // Default: 'human_gate'

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)` - Enables immutable versioning

Immutable workflow graph definition. Changes create new versions. Context schema drives DO SQLite table generation via `@wonder/context`.

**Ownership:**

- `project_id` set: Project-local definition
- `library_id` set: Reusable library definition

**ResourceDeclaration:**

```typescript
type ResourceDeclaration = {
  type: 'container';
  image: string; // Container image (e.g., 'node:20')
  repo_id: string; // FK → repos
  base_branch: string; // Branch to create working branch from
  merge_on_success: boolean; // Merge to base_branch on completion
  merge_strategy: 'rebase' | 'fail' | 'force'; // Conflict resolution
};
```

Each key in `resources` is a `resource_id` (e.g., `dev_env`, `lib_env`) used to reference the container in actions.

**Accepts Resources:**

- `accepts_resources`: Declares resource requirements for sub-workflows
- Used by workflows that expect resources to be passed via `pass_resources` in workflow actions
- Example: `{ "dev_env": { type: "container" } }` indicates this workflow requires a dev_env container
- Enables design-time validation: calling workflow without passing required resources is an error
- Only relevant for sub-workflows; top-level workflows declare `resources`, not `accepts_resources`

---

### Workflow

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  project_id: string; // FK → projects
  name: string;
  description: string;
  workflow_def_id: string; // References WorkflowDef
  pinned_version: number | null; // null = use latest
  enabled: boolean; // Can this workflow be triggered?
  created_at: string;
  updated_at: string;
}
```

Project-bound workflow instance. Can reference:

- Project-local `WorkflowDef` (same project)
- Library `WorkflowDef` (shared definition)

Version pinning enables stability (pin to v3) or live updates (null = latest).

---

### Node

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  ref: string; // Human-readable identifier (unique per workflow)
  workflow_def_id: string; // Composite FK
  workflow_def_version: number;
  name: string;

  task_id: string; // References TaskDef
  task_version: number; // Task version to execute

  input_mapping: object | null; // Map workflow context → task input
  output_mapping: object | null; // Map task output → workflow context

  resource_bindings: Record<string, string> | null; // Map generic resource names to workflow resource IDs
}
```

**Primary Key:** `(workflow_def_id, workflow_def_version, id)`

Task execution point in workflow graph. **No branching logic** - nodes only:

1. Execute tasks via worker
2. Map data (workflow context ↔ task I/O)

All control flow (conditions, parallelism, synchronization) lives on **Transitions**.

**Mappings:**

- `input_mapping`: JSONPath expressions mapping workflow context to task input
- `output_mapping`: JSONPath expressions writing task output to workflow context

**Resource Bindings:**

- `resource_bindings`: Maps generic resource names (used by actions/tools) to workflow-specific resource IDs
- Example: `{ "container": "dev_env", "build_env": "build_container" }` maps action's "container" reference to workflow's "dev_env" resource
- At dispatch time, coordinator resolves these to actual container DO IDs for task execution
- Actions and tools use generic names ("container", "build_env"), nodes provide the mapping

---

### Transition

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  ref: string | null; // Optional human-readable identifier
  workflow_def_id: string; // Composite FK
  workflow_def_version: number;
  from_node_id: string; // Source node
  to_node_id: string; // Target node
  priority: number; // Evaluation order (lower = first)

  condition: object | null; // Structured or expression condition
  spawn_count: number | null; // How many tokens to spawn (null = 1)
  foreach: object | null; // Dynamic iteration config
  synchronization: object | null; // Fan-in merge config
  loop_config: object | null; // Loop limits/timeout
}
```

**Primary Key:** `(workflow_def_id, workflow_def_version, id)`

Edge in workflow graph. **All branching logic lives here:**

**Priority Tiers:**

- Same priority → all matching transitions fire (parallel dispatch)
- Different priority → first tier with ANY match wins (sequential evaluation)

**Conditions:**

```typescript
// Structured (queryable)
{
  type: "structured",
  definition: {
    type: "comparison",
    left: { type: "field", path: "state.approved" },
    operator: "==",
    right: { type: "literal", value: true }
  }
}

// Expression (SQL)
{
  type: "expression",
  expr: "approved == true AND priority > 5",
  reads: ["state.approved", "state.priority"]  // For dependency tracking
}
```

**Dynamic Spawning:**

- `spawn_count: 3` → spawn 3 parallel tokens
- `foreach: { collection: "state.items", item_var: "item" }` → spawn N tokens (one per item)

**Synchronization (Fan-in):**

```typescript
{
  strategy: "all" | "any" | { m_of_n: 3 },
  sibling_group: "fan_out_transition_id",  // Which fan-out spawned these siblings
  timeout_ms: number | null,    // Max wait time for siblings (null = no timeout)
  on_timeout: "proceed_with_available" | "fail",  // Default: "fail"
  merge: {
    source: "_branch.output",  // Path in each sibling's isolated state
    target: "state.results",   // Destination in merged context
    strategy: "append" | "merge_object" | "keyed_by_branch" | "last_wins"
  }
}
```

When `on_timeout: "proceed_with_available"`, merge whatever siblings completed and continue. Waiting siblings marked as timed out.

---

## Execution

### TaskDef

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;                   // ULID
  version: number;              // Incremental version
  name: string;
  description: string;

  // Ownership (exactly one)
  project_id: string | null;    // Local to project
  library_id: string | null;    // In reusable library

  tags: string[];               // Discovery/categorization

  input_schema: JSONSchema;     // Task input validation
  output_schema: JSONSchema;    // Task output validation

  steps: Step[];                // Embedded step definitions (ordered)

  retry: {
    max_attempts: number;
    backoff: "none" | "linear" | "exponential";
    initial_delay_ms: number;
    max_delay_ms: number | null;
  } | null;

  timeout_ms: number | null;    // Whole-task timeout

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)`

Linear sequence of steps executed by a single worker. Task state is in-memory only—no durable coordination.

**Constraints:**

- No parallelism (steps execute sequentially)
- No sub-tasks (flat sequence only)
- No human gates (tasks don't pause; human actions create async workflow-level gates and complete immediately)
- Simple branching only (if/else, on_failure)

**Retry semantics:** Task retry is **business-level retry**—for wrong outputs, failed validations, schema violations. The entire task restarts from step 0 with fresh context. This is distinct from action-level infrastructure retry, which is automatic and invisible.

Individual step failures can abort the task, signal task retry, or continue to the next step based on `on_failure`.

See [Execution Model](./execution-model.md) for design rationale.

---

### Step

**Storage:** Embedded in TaskDef (not a separate table)  
**Schema:**

```typescript
{
  id: string;                   // ULID
  ref: string;                  // Human-readable identifier (unique per task)
  ordinal: number;              // Execution order (0-indexed)

  action_id: string;            // FK → ActionDef
  action_version: number;

  input_mapping: object | null;   // Map task context → action input
  output_mapping: object | null;  // Map action output → task context

  on_failure: "abort" | "retry" | "continue";  // Default: abort

  condition: {
    if: string;                 // Expression evaluated against task context
    then: "continue" | "skip" | "succeed" | "fail";
    else: "continue" | "skip" | "succeed" | "fail";
  } | null;
}
```

Single action execution within a task. Steps execute in `ordinal` order.

**Task context:**

Steps read from and write to an in-memory context object:

```typescript
{
  input: { ... },       // Immutable, from Node's input_mapping
  state: { ... },       // Mutable, accumulates step outputs
  output: { ... }       // Set by final step(s), returned to Node
}
```

**Mappings:**

- `input_mapping`: Paths from task context → action input
- `output_mapping`: Paths from action output → task context

**on_failure behavior:**

`on_failure` is a **routing decision**, not a retry mechanism. It determines what happens after this step fails.

| Value      | Behavior                                             |
| ---------- | ---------------------------------------------------- |
| `abort`    | Task fails immediately, returns error to coordinator |
| `retry`    | Signal task retry (coordinator restarts from step 0) |
| `continue` | Ignore failure, proceed to next step                 |

**Conditional execution:**

```typescript
condition: {
  if: "input.auto_format == true",
  then: "continue",
  else: "skip"
}
```

---

### ActionDef

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;               // ULID
  version: number;          // Incremental version
  name: string;
  description: string;
  kind: ActionKind;         // See ActionKind enum below

  implementation: object;   // Kind-specific config

  requires: JSONSchema | null;  // Input schema
  produces: JSONSchema | null;  // Output schema

  execution: {
    timeout_ms: number | null;
    retry_policy: {
      max_attempts: number;
      backoff: "none" | "linear" | "exponential";
      initial_delay_ms: number;
      max_delay_ms: number | null;
      retryable_errors: string[] | null;  // Error codes/patterns (transient only)
    } | null;
  } | null;

  idempotency: {
    key_template: string;   // Template for idempotency key
    ttl_seconds: number | null;
  } | null;

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)`

Versioned, reusable action implementation. Atomic operations executed by workers.

**Retry semantics:** `execution.retry_policy` handles **infrastructure failures only**—network errors, rate limits, provider 5xx errors. This retry is automatic and invisible to the task. Business-level retry (wrong outputs, validation failures) is handled by TaskDef retry, which restarts from step 0.

**ActionKind:**

- `llm` - LLM inference (Anthropic, OpenAI, etc.)
- `mcp` - Model Context Protocol tool call
- `http` - HTTP API call
- `tool` - Standard library tool (git_commit, write_artifact, run_tests, etc.)
- `shell` - Execute raw command in container (escape hatch)
- `workflow` - Invoke sub-workflow
- `context` - Pure context transformation
- `vector` - Semantic search via Vectorize
- `metric` - Write to Analytics Engine
- `human` - Human-in-the-loop approval/input

**Implementation schemas (kind-specific):**

```typescript
// llm
{
  prompt_spec_id: string; // FK → prompt_specs
  model_profile_id: string; // FK → model_profiles
}

// mcp_tool
{
  mcp_server_id: string;
  tool_name: string;
}

// http_request
{
  url_template: string; // Handlebars template
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string> | null;
  body_template: string | null;
}

// tool
{
  tool_name: string; // e.g., 'git_commit', 'write_artifact', 'run_tests'
  tool_version: number | null; // null = latest
  // Tools declare required resources in their ToolDef, not in action implementation
}

// shell
{
  command_template: string; // Handlebars template
  working_dir: string | null;
  resource_name: string; // Generic resource name (e.g., "container", "build_env")
}

// workflow
{
  workflow_def_id: string | { from_context: string };
  version: number | { from_context: string } | null; // null = latest
  inherit_artifacts: boolean; // default: false
  pass_resources: Record<string, string> | null; // Map parent resource_id → child resource key
  on_failure: 'propagate' | 'catch'; // default: propagate
}

// context
{
  updates: Array<{
    path: string; // JSONPath to update
    expr: string; // SQL expression or value
  }>;
}

// vector_search
{
  vector_index_id: string;
  top_k: number;
  similarity_threshold: number | null;
}

// emit_metric
{
  metric_name: string;
  value: number | { expr: string };
  dimensions: Record<string, string> | null;
}
```

---

### ToolDef

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID
  version: number;
  name: string; // e.g., 'git_commit', 'write_artifact'
  description: string;

  category: 'git' | 'file' | 'artifact' | 'test' | 'package' | 'other';

  requires_resource: string | null; // Generic resource requirement (e.g., "container")

  input_schema: JSONSchema; // Tool input validation
  output_schema: JSONSchema; // Tool output validation

  implementation: {
    handler: string; // Handler function name (e.g., 'executeGitCommit')
    config: object; // Tool-specific configuration
  }

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)`

Standard library tool definition. Tools are pre-built, versioned operations that wrap common tasks:

- **Git operations**: commit, push, merge, status
- **Artifact management**: write, read, list artifacts
- **Testing**: run tests, lint, build
- **File operations**: read, write, delete files
- **Package management**: install, update dependencies

**Resource requirements:**

- Tools declare generic resource needs via `requires_resource`
- Node's `resource_bindings` map these to workflow-specific resources
- Example: `git_commit` requires "container", node binds "container" → "dev_env" → DO ID

**Implementation:**

Tools are implemented as handlers in the Executor service. The `handler` field references the function name, and `config` provides tool-specific settings.

---

### PromptSpec

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;               // ULID
  version: number;
  name: string;
  description: string;

  system_prompt: string | null;
  template: string;         // Message template

  requires: JSONSchema;     // Template variables schema
  produces: JSONSchema;     // Expected output schema

  examples: Array<{
    input: object;
    output: unknown;
  }> | null;

  tags: string[] | null;

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)`

Versioned prompt template for LLM actions. Supports variable interpolation and output validation.

---

### ModelProfile

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;               // ULID
  name: string;
  provider: "anthropic" | "openai" | "google" | "cloudflare" | "local";
  model_id: string;         // Provider-specific model identifier

  parameters: {
    temperature: number;
    max_tokens: number;
    top_p: number | null;
    stop_sequences: string[] | null;
  };

  execution_config: object | null;  // Provider-specific settings

  cost_per_1k_input_tokens: number;   // USD
  cost_per_1k_output_tokens: number;  // USD
}
```

LLM configuration profile. Enables:

- Centralized model management
- Cost tracking
- A/B testing (multiple profiles for same prompt)

---

## Execution State

### WorkflowRun

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string; // ULID (workflow_run_id)
  project_id: string;
  workflow_id: string;
  workflow_def_id: string;
  workflow_version: number;

  status: 'running' | 'completed' | 'failed' | 'waiting';

  // Nested workflow tracking
  parent_run_id: string | null;
  parent_node_id: string | null;

  // Container resource tracking
  container_resources: Record<string, string> | null; // resource_id → container_id (DO ID)

  // Merge configuration per resource
  merge_config: Record<
    string,
    {
      repo_id: string;
      base_branch: string;
      working_branch: string;
      merge_on_success: boolean;
      merge_strategy: 'rebase' | 'fail' | 'force';
    }
  > | null;

  durable_object_id: string; // DO stub ID

  created_at: string;
  completed_at: string | null;
}
```

Metadata for single workflow execution. Each run gets its own Coordinator DO instance. Run metadata stored in D1 for querying across all runs.

**Container resource tracking:**

- `container_resources`: Maps resource_id (from WorkflowDef.resources) to ContainerDO ID
- Enables container ownership validation and cleanup
- Example: `{ "dev_env": "container_abc123", "test_env": "container_def456" }`

**Merge configuration:**

- Copied from WorkflowDef.resources on run creation
- Used by Coordinator to merge working branches on completion
- One entry per container resource

---

### Container

**Storage:** DO SQLite (ContainerDO)  
**Schema:**

```typescript
{
  id: string; // DO ID (container instance ID)
  resource_id: string; // Key from WorkflowDef.resources
  workflow_run_id: string; // Run that created this container
  owner_run_id: string; // Current owner (for sub-workflow transfer)

  repo_id: string; // FK → repos
  base_branch: string; // Branch created from
  working_branch: string; // wonder/run-{run_id}
  current_sha: string | null; // Latest commit SHA
  image: string; // Container image (e.g., 'node:20')

  status: 'provisioning' | 'active' | 'hibernated' | 'destroyed';

  created_at: string;
  last_accessed_at: string;
}
```

Ephemeral container instance with linear ownership. One ContainerDO per resource declaration per run.

**Ownership:**

- Created with `owner_run_id = workflow_run_id`
- Transfers to child run via `workflow_call` with `pass_resources`
- Returns to parent when child completes
- Only current owner can execute commands via `containerStub.exec(owner_run_id, command)`

**Lifecycle:**

- Provisioning: Container starting, cloning repo at working_branch
- Active: Ready for command execution
- Hibernated: Destroyed but working_branch preserved (resume from SHA)
- Destroyed: Cleaned up after run completion

**RPC Operations (Containers Service):**

```typescript
// Claim ownership of container for workflow run
claim(run_id: string, base_branch: string): Promise<{
  working_branch: string;
  current_sha: string;
}>;

// Release ownership (cleanup or transfer preparation)
release(run_id: string): Promise<void>;

// Transfer ownership to another run (for sub-workflows)
transfer(from_run_id: string, to_run_id: string): Promise<void>;

// Execute shell command (validates ownership)
exec(run_id: string, command: string, timeout_ms?: number): Promise<{
  stdout: string;
  stderr: string;
  exit_code: number;
}>;

// Hibernate container (commit working state, destroy instance)
hibernate(run_id: string): Promise<{
  sha: string; // Final commit SHA
}>;

// Resume from hibernation (restore working branch)
resume(run_id: string, sha: string): Promise<void>;
```

**Provisioning flow:**

1. `claim(run_id, base_branch)` → creates working_branch, clones repo from Source service
2. Container provisions: pulls image, sets up filesystem, installs dependencies from Cache service
3. Status transitions: `provisioning` → `active`

**Command execution:**

1. Executor calls `exec(run_id, command)`
2. ContainerDO validates `run_id === owner_run_id`
3. Executes command via Cloudflare Containers platform
4. Returns stdout/stderr/exit_code

**Git operations:**

- Container filesystem has git remote helper configured
- `git push wonder <branch>` → HTTP POST to Source service → R2/D1 write
- Source service translates git protocol to R2 object writes + D1 ref updates

---

### Token

**Storage:** DO SQLite (Coordinator)  
**Schema:**

```typescript
{
  id: string; // ULID
  workflow_run_id: string;
  node_id: string;
  status: TokenStatus; // See status enum below

  path_id: string; // Hierarchical execution path (e.g., "0", "0.1", "0.1.fanin")
  parent_token_id: string | null;
  fan_out_transition_id: string | null; // Which transition spawned siblings

  branch_index: number; // Position in parallel group (0-indexed)
  branch_total: number; // Size of parallel group

  state_data: string | null; // JSON for status-specific metadata

  state_updated_at: string;
  created_at: string;
  updated_at: string;
}
```

**TokenStatus:**

- `pending` - Created, awaiting dispatch
- `dispatched` - Sent to Executor
- `executing` - Executor acknowledged, running action
- `waiting_for_siblings` - At fan-in, waiting for synchronization
- `completed` - Terminal state (success)
- `failed` - Terminal state (error)
- `timed_out` - Terminal state (timeout)
- `cancelled` - Terminal state (explicit cancellation)

**Token Lifecycle:**

```
pending → dispatched → executing → completed
                                 → failed
                                 → timed_out

pending → dispatched → executing → waiting_for_siblings → completed
```

**Fan-out tracking:**

- Sibling tokens share same `fan_out_transition_id`
- Fan-in uses this to identify which tokens to synchronize
- `path_id` provides hierarchical trace (enables nested fan-out/fan-in)

**Branch context:**

- Each token in parallel group has isolated `_branch` state
- `branch_index` identifies position (0, 1, 2, ...)
- `branch_total` is size of sibling group

---

### Context

**Storage:** DO SQLite (Coordinator)  
**Schema:** **Dynamic** - Generated from `WorkflowDef.context_schema` via `@wonder/context`

Context is the workflow's runtime state, stored as **normalized SQL tables** (not JSON blobs).

**Example context_schema:**

```typescript
{
  type: "object",
  properties: {
    user_id: { type: "integer" },
    approved: { type: "boolean" },
    results: { type: "array", items: { type: "string" } },
    metadata: {
      type: "object",
      properties: {
        timestamp: { type: "integer" },
        source: { type: "string" }
      }
    }
  }
}
```

**Generated DDL:**

```sql
CREATE TABLE workflow_context (
  user_id INTEGER,
  approved INTEGER,  -- SQLite boolean (0/1)
  metadata_timestamp INTEGER,
  metadata_source TEXT
);

CREATE TABLE workflow_context_results (
  workflow_context_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  value TEXT,
  FOREIGN KEY (workflow_context_id) REFERENCES workflow_context(rowid)
);
```

**Key features:**

- Arrays become separate tables with foreign keys
- Nested objects flatten to prefixed columns
- Transition conditions query directly against SQL columns
- `@wonder/context` DMLGenerator produces INSERT/UPDATE/DELETE statements

**Branch isolation:**

- During fan-out, each token writes to isolated `_branch` context
- At fan-in, merge strategy combines sibling `_branch.output` → main context

---

## Artifacts & Search

### ArtifactType

**Storage:** D1 (Resources)  
**Schema:**

```typescript
{
  id: string;                   // ULID
  version: number;              // Incremental version
  project_id: string;           // FK → projects
  name: string;                 // e.g., "decision", "research", "report"
  description: string;

  path_pattern: string;         // Glob pattern, e.g., "decisions/**/*.md"
  schema: JSONSchema;           // Frontmatter/content validation

  index_config: {
    extract_fields: string[];   // Fields to extract to D1 for queries
    embed_fields: string[];     // Fields to embed in Vectorize
  } | null;

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)`

Defines artifact types within a project. Artifacts themselves are files in the project's artifacts repo—ArtifactType defines validation and indexing rules applied on commit.

**Validation:** When files matching `path_pattern` are committed, Source service validates against `schema`. Invalid commits are rejected.

**Indexing:** On commit, `extract_fields` are written to ArtifactIndex for structured queries. `embed_fields` are embedded and stored in Vectorize for semantic search.

---

### ArtifactIndex

**Storage:** D1 (Source Service)  
**Schema:**

```typescript
{
  id: string; // ULID
  repo_id: string; // FK → repos (artifacts repo)
  path: string; // File path in repo
  artifact_type_id: string; // FK → artifact_types

  commit_sha: string; // Latest commit affecting this file
  branch: string; // Branch where indexed

  extracted_data: string; // JSON (fields from extract_fields)

  created_at: string;
  updated_at: string;
}
```

Denormalized index of artifact files for querying. Updated on commit by Source service. Content lives in git—this enables queries without tree traversal.

---

### VectorIndex

**Storage:** Vectorize (embeddings) + D1 (Resources)  
**Schema (D1):**

```typescript
{
  id: string;
  project_id: string;
  name: string;
  vectorize_index_id: string;   // Cloudflare Vectorize index ID

  artifact_type_ids: string[];  // Which artifact types to index

  embedding_provider: "openai" | "cloudflare_ai";
  embedding_model: string;
  dimensions: number;

  auto_index: boolean;          // Automatically index on commit?

  created_at: string;
}
```

Semantic search over artifacts. Configured per project, indexes artifacts matching specified types.

---

## Observability

### Event

**Storage:** D1 (Events Service) + Analytics Engine  
**Schema:**

```typescript
{
  id: string; // ULID
  timestamp: number; // Unix timestamp (ms)
  sequence_number: number; // Per-run ordering (for replay)
  event_type: string; // Event type identifier

  // Execution context
  workflow_run_id: string;
  parent_run_id: string | null;
  workflow_def_id: string;
  node_id: string | null;
  token_id: string | null;
  path_id: string | null;

  // Tenant context
  workspace_id: string;
  project_id: string;

  // Cost tracking
  tokens: number | null; // LLM token count
  cost_usd: number | null; // USD cost

  // Payload
  message: string | null;
  metadata: string; // JSON blob (event-specific data)
}
```

**Indexes:**

- `(workflow_run_id, sequence_number)` - Replay ordering
- `(workspace_id)`, `(project_id)` - Tenant queries
- `(event_type)`, `(timestamp)` - Analytics
- `(node_id)`, `(token_id)` - Debugging

**Event types:**

- `workflow_started`, `workflow_completed`, `workflow_failed`
- `token_spawned`, `token_dispatched`, `token_completed`, `token_failed`
- `node_started`, `node_completed`, `node_failed`
- `context_updated`, `artifact_written`
- `fan_in_waiting`, `fan_in_completed`

**Dual storage:**

- **D1**: Queryable event log (90+ day retention)
- **Analytics Engine**: Metrics aggregation (time-series analysis)

Events enable:

- Workflow replay (reconstruct state from event stream)
- Debugging (trace token path, find failures)
- Cost analysis (aggregate token usage, spending)
- Audit trail (permanent record of all state changes)

---

### Log

**Storage:** D1 (Logs Service) → R2 (archive)  
**Schema:**

```typescript
{
  id: string; // ULID
  timestamp: number; // Unix timestamp (ms)
  level: 'debug' | 'info' | 'warn' | 'error';

  service: string; // Service name (coordinator, executor, etc.)
  trace_id: string; // Request/run correlation ID

  message: string;
  metadata: string | null; // JSON blob

  error_stack: string | null;
}
```

**Lifecycle:**

- Live logs: D1 (30 days)
- Archive: R2 (compressed, long-term storage)

Logs are **ephemeral operational data** for debugging services, not workflow execution. Use Events for workflow observability.

---

## Ephemeral Primitives

### TaskPayload

**Storage:** Nowhere (RPC message only)  
**Type:**

```typescript
interface TaskPayload {
  token_id: string;
  workflow_run_id: string;
  task_id: string;
  task_version: number;
  input: Record<string, unknown>;
  resources?: Record<string, string>; // Generic name → container DO ID
  timeout_ms?: number;
  retry_attempt?: number;
}
```

Message sent from Coordinator to Executor to dispatch task execution. Includes all context needed for stateless execution.

---

### TaskResult

**Storage:** Nowhere (RPC message only)  
**Type:**

```typescript
interface TaskResult {
  token_id: string;
  success: boolean;
  output: Record<string, unknown>;
  error?: {
    type: 'step_failure' | 'task_timeout' | 'validation_error';
    step_ref?: string;
    message: string;
    retryable: boolean;
    context_snapshot?: Record<string, unknown>; // For debugging
  };
  metrics: {
    duration_ms: number;
    steps_executed: number;
    llm_tokens?: {
      input: number;
      output: number;
      cost_usd: number;
    };
  };
}
```

Message returned from Executor to Coordinator after task execution. Includes output, error details, and execution metrics.

**context_snapshot:** On failure, Executor optionally includes the task context state at time of failure for debugging. This helps diagnose issues without requiring full workflow replay.

---

### Decision

**Storage:** Nowhere (return values only)  
**Type:**

```typescript
type Decision =
  | { type: 'CREATE_TOKEN'; workflow_run_id: string; node_id: string /* ... */ }
  | { type: 'UPDATE_CONTEXT'; workflow_run_id: string; updates: object }
  | { type: 'DISPATCH_TASK'; token_id: string; task_id: string /* ... */ }
  | { type: 'COMPLETE_WORKFLOW'; workflow_run_id: string }
  | { type: 'CANCEL_TOKENS'; token_ids: string[] }
  | { type: 'WAIT' /* ... */ };
```

Pure data returned from decision functions (`Router.decide()`, `TaskManager.prepare()`). Never persisted.

**Decision → Execution → Event pattern:**

1. **Decision** (pure function): Analyze state, return decision object
2. **Execute** (actor message): Apply decision as SQL write or RPC call
3. **Event** (outcome): Emit event recording what happened

Enables **testable coordination logic** without spinning up actors.

---

## Summary: Primitive Storage Map

| Primitive         | Managed By     | Storage               | Lifecycle             |
| ----------------- | -------------- | --------------------- | --------------------- |
| **Workspace**     | Resources      | D1                    | Persistent            |
| **Project**       | Resources      | D1                    | Persistent            |
| **Library**       | Resources      | D1                    | Persistent            |
| **Repo**          | Resources      | D1 (metadata)         | Persistent            |
| **Ref**           | Source         | D1                    | Persistent (mutable)  |
| **GitObject**     | Source         | R2                    | Immutable             |
| **WorkflowDef**   | Resources      | D1                    | Immutable (versioned) |
| **Workflow**      | Resources      | D1                    | Persistent            |
| **Node**          | Resources      | D1                    | Immutable (versioned) |
| **Transition**    | Resources      | D1                    | Immutable (versioned) |
| **TaskDef**       | Resources      | D1                    | Immutable (versioned) |
| **ActionDef**     | Resources      | D1                    | Immutable (versioned) |
| **PromptSpec**    | Resources      | D1                    | Immutable (versioned) |
| **ModelProfile**  | Resources      | D1                    | Persistent            |
| **ArtifactType**  | Resources      | D1                    | Immutable (versioned) |
| **WorkflowRun**   | Resources      | D1 → DO (run) → D1    | Persistent            |
| **Container**     | Containers     | DO SQLite             | Per-run (ephemeral)   |
| **Token**         | Coordinator    | DO SQLite             | Per-run (ephemeral)   |
| **Context**       | Coordinator    | DO SQLite → D1        | Per-run → snapshot    |
| **TaskPayload**   | Executor       | None                  | RPC message only      |
| **TaskResult**    | Executor       | None                  | RPC message only      |
| **Decision**      | Coordinator    | None                  | Return value only     |
| **ArtifactIndex** | Source         | D1                    | Derived (on commit)   |
| **VectorIndex**   | Resources      | D1 + Vectorize        | Persistent            |
| **Event**         | Events Service | D1 + Analytics Engine | Permanent (90+ days)  |
| **Log**           | Logs Service   | D1 → R2               | 30 days → archive     |

**Storage patterns:**

- **D1 via Resources**: Shared metadata (workflow defs, actions, projects, repos)
- **D1 via Source**: Git refs, artifact index
- **DO SQLite**: Isolated execution state (one DO per workflow run)
- **R2**: Git objects, dependency cache, large files
- **Events**: Observability (workflow state changes, permanent record)
- **Logs**: Operations (service debugging, ephemeral)
- **Vectorize**: Semantic search (embeddings)
- **Analytics Engine**: Metrics (time-series aggregations)
