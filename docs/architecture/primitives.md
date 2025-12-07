# Primitives

Core data types in the Wonder workflow system, organized by storage layer and managing service.

## Storage Architecture

**D1 (Resources Service)** - Tenant-scoped metadata, workflow definitions, versioned across workspace
**DO SQLite (Coordinator)** - Per-run execution state, isolated per workflow_run_id  
**Events Service** - Observability layer (D1 + Analytics Engine), permanent audit trail  
**Logs Service** - Operational logs (D1 → R2 archive), ephemeral debugging  
**R2** - Large binary artifacts, files  
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

Reusable collection of workflow definitions and actions. Libraries enable:

- Sharing workflows across projects
- Versioned, immutable definitions
- Public libraries (when `workspace_id` is null)

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

  initial_node_id: string;      // Starting node ULID

  created_at: string;
  updated_at: string;
}
```

**Primary Key:** `(id, version)` - Enables immutable versioning

Immutable workflow graph definition. Changes create new versions. Context schema drives DO SQLite table generation via `@wonder/schemas`.

**Ownership:**

- `project_id` set: Project-local definition
- `library_id` set: Reusable library definition

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

  action_id: string; // References ActionDef
  action_version: number; // Action version to execute

  input_mapping: object | null; // Map context → action input
  output_mapping: object | null; // Map action output → context
}
```

**Primary Key:** `(workflow_def_id, workflow_def_version, id)`

Action execution point in workflow graph. **No branching logic** - nodes only:

1. Execute actions via Executor service
2. Map data (context ↔ action I/O)

All control flow (conditions, parallelism, synchronization) lives on **Transitions**.

**Mappings:**

- `input_mapping`: JSONPath expressions mapping context state to action input
- `output_mapping`: JSONPath expressions writing action output to context

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
  merge: {
    source: "_branch.output",  // Path in each sibling's isolated state
    target: "state.results",   // Destination in merged context
    strategy: "append" | "merge_object" | "keyed_by_branch" | "last_wins"
  }
}
```

---

## Actions

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
      retryable_errors: string[] | null;  // Error codes/patterns
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

Versioned, reusable action implementation. Executed by Executor service.

**ActionKind:**

- `llm_call` - LLM inference (Anthropic, OpenAI, etc.)
- `mcp_tool` - Model Context Protocol tool call
- `http_request` - HTTP API call
- `human_input` - Human-in-the-loop approval/input
- `update_context` - Pure context transformation
- `write_artifact` - Store large output to R2
- `workflow_call` - Invoke sub-workflow
- `vector_search` - Semantic search via Vectorize
- `emit_metric` - Write to Analytics Engine

**Implementation schemas (kind-specific):**

```typescript
// llm_call
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

// workflow_call
{
  workflow_def_id: string | { from_context: string };
  version: number | { from_context: string } | null; // null = latest
  inherit_artifacts: boolean; // default: false
  on_failure: 'propagate' | 'catch'; // default: propagate
}

// update_context
{
  updates: Array<{
    path: string; // JSONPath to update
    expr: string; // SQL expression or value
  }>;
}

// write_artifact
{
  artifact_type_id: string;
  content_mapping: Record<string, string>; // Map action output → artifact schema
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

  durable_object_id: string; // DO stub ID

  created_at: string;
  completed_at: string | null;
}
```

Metadata for single workflow execution. Each run gets its own Coordinator DO instance. Run metadata stored in D1 for querying across all runs.

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
**Schema:** **Dynamic** - Generated from `WorkflowDef.context_schema` via `@wonder/schemas`

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
- `@wonder/schemas` DMLGenerator produces INSERT/UPDATE/DELETE statements

**Branch isolation:**

- During fan-out, each token writes to isolated `_branch` context
- At fan-in, merge strategy combines sibling `_branch.output` → main context

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

### Decision

**Storage:** Nowhere (return values only)  
**Type:**

```typescript
type Decision =
  | { type: 'CREATE_TOKEN'; workflow_run_id: string; node_id: string /* ... */ }
  | { type: 'UPDATE_CONTEXT'; workflow_run_id: string; updates: object }
  | { type: 'DISPATCH_TASK'; token_id: string; action_id: string /* ... */ }
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

## Artifacts & Search

### Artifact

**Storage:** R2 (binary content) + D1 (metadata)  
**Schema (D1 metadata):**

```typescript
{
  id: string; // ULID
  workflow_run_id: string;
  node_id: string;
  artifact_type_id: string;

  storage_key: string; // R2 object key
  content_type: string;
  size_bytes: number;

  schema_data: string; // JSON (validated against ArtifactType.schema)

  created_at: string;
}
```

Large outputs (files, documents, images) stored in R2. Metadata in D1 enables querying without loading content.

**ArtifactType** (D1):

```typescript
{
  id: string;
  name: string;
  description: string;
  schema: JSONSchema; // Structure validation
  version: number;
}
```

---

### VectorIndex

**Storage:** Vectorize (embeddings) + D1 (metadata)  
**Schema (D1):**

```typescript
{
  id: string;
  name: string;
  vectorize_index_id: string;  // Cloudflare Vectorize index ID

  artifact_type_ids: string[];  // Which artifact types to index

  embedding_provider: "openai" | "cloudflare_ai";
  embedding_model: string;
  dimensions: number;

  content_fields: string[];     // Which artifact schema fields to embed
  auto_index: boolean;          // Automatically index new artifacts?

  created_at: string;
}
```

Semantic search over artifacts. Vectorize stores embeddings, D1 stores configuration.

---

## Summary: Primitive Storage Map

| Primitive        | Managed By    | Storage                | Lifecycle             |
| ---------------- | ------------- | ---------------------- | --------------------- |
| **Workspace**    | Resources     | D1                     | Persistent            |
| **Project**      | Resources     | D1                     | Persistent            |
| **Library**      | Resources     | D1                     | Persistent            |
| **WorkflowDef**  | Resources     | D1                     | Immutable (versioned) |
| **Workflow**     | Resources     | D1                     | Persistent            |
| **Node**         | Resources     | D1                     | Immutable (versioned) |
| **Transition**   | Resources     | D1                     | Immutable (versioned) |
| **ActionDef**    | Resources     | D1                     | Immutable (versioned) |
| **PromptSpec**   | Resources     | D1                     | Immutable (versioned) |
| **ModelProfile** | Resources     | D1                     | Persistent            |
| **WorkflowRun**  | Resources     | D1 → DO (run) → D1     | Persistent\*          |
| **Token**        | Coordinator   | DO SQLite              | Per-run (ephemeral)   |
| **Context**      | Coordinator   | DO SQLite → D1         | Per-run → snapshot\*  |
| **Decision**     | Coordinator   | None                   | Return value only     |
| **Event**        | Event Service | D1 + Analytics Engine  | Permanent (90+ days)  |
| **Log**          | Logs Service  | D1 → R2                | 30 days → archive     |
| **Artifact**     | Coordinator   | D1 → DO SQLite → D1/R2 | Persistent\*          |
| **VectorIndex**  | Resources     | D1 + Vectorize         | Persistent            |

**\* Storage lifecycle notes:**

- **WorkflowRun**: Created in D1 (`status: running`) → Coordinator works with DO copy → Updated in D1 at completion (via Resources RPC)
- **Context**: Built incrementally in DO SQLite during execution → Final state optionally persisted to D1 for debugging/queries
- **Artifact**: Metadata created in D1 → Content buffered in DO SQLite during execution → Persisted to D1 (metadata) + R2 (binary content) at completion

**Storage patterns:**

- **D1 via Resources**: Shared metadata (workflow defs, actions, projects)
- **DO SQLite**: Isolated execution state (one DO per workflow run)
- **Events**: Observability (workflow state changes, permanent record)
- **Logs**: Operations (service debugging, ephemeral)
- **R2**: Large files (artifacts, log archives)
- **Vectorize**: Semantic search (embeddings)
- **Analytics Engine**: Metrics (time-series aggregations)
