# Wonder

Wonder is a workflow orchestration platform for AI-powered software development. It executes long-running, massively parallel workflows where reasoning strategies, consensus mechanisms, and research pipelines are all composable graphs.

## Why Wonder Exists

AI-assisted development involves complex, multi-step processes: researching a problem, generating candidate solutions, evaluating them with multiple judges, synthesizing results, and waiting for human approval. These processes:

- Run for hours to days
- Involve hundreds of LLM calls
- Require true parallelism (100 judges evaluating simultaneously)
- Need human checkpoints and approvals
- Must be observable, debuggable, and replayable

Wonder provides the orchestration layer that makes this possible.

## Structure

### Workspace → Project → Workflow

```
Workspace (Acme Corp)
├── Project (Backend Rewrite)
│   ├── Workflow: code_review_pipeline
│   ├── Workflow: research_assistant
│   └── Artifacts, Runs, Settings
├── Project (ML Platform)
│   └── ...
└── Settings (allowed providers, budgets)
```

**Workspace** is the top-level container. It defines allowed model providers, MCP servers, and budget limits that apply to all projects within it.

**Project** is an isolated workspace. Workflows, artifacts, and runs are project-scoped. Projects have their own settings for rate limits, default models, and budgets.

**Workflow** binds a graph definition to a project, adding triggers (webhook, schedule, event) and enabling runs.

### Library

Reusable graph definitions live in libraries:

```
Library (wonder-patterns)
├── react_reasoning_v2
├── consensus_majority_v3
├── tree_of_thought_v1
└── debate_v2
```

Libraries can be global (shared across all workspaces) or workspace-private. Projects reference library definitions by ID, optionally pinning to a specific version.

### WorkflowDef

`WorkflowDef` is the graph definition—nodes and transitions. It's the same structure whether owned by a project or a library. The `owner` field indicates where it lives:

```typescript
owner:
  | { type: 'project'; project_id: string }
  | { type: 'library'; library_id: string }
```

### "Routine" (Library Workflow) Terminology

We use **routine** informally to describe a `WorkflowDef` designed to be invoked by other workflows rather than run standalone. ReAct, Tree-of-Thought, and consensus mechanisms are routines. This is terminology for discussion and UI—not a separate primitive. A routine is just a `WorkflowDef` in a library with `tags: ['routine', 'reasoning']`, invoked via the `workflow_call` action.

## Core Concepts

### Workflows Are Graphs

A workflow is a directed graph of nodes connected by transitions. Nodes execute actions. Transitions route execution based on conditions.

```
LLM Call (fan_out: all, 5 judges)
  → Human Input (each judge votes)
  → Compute (fan_in: all, merge votes)
→ Compute (determine winner)
```

### Unified Node Model

Every node has the same structure: an **action** to execute, plus **fan-out** and **fan-in** semantics for parallelism.

```typescript
NodeDef {
  action_id: string           // what to execute
  fan_out: 'first_match' | 'all'
  fan_in: 'any' | 'all' | { m_of_n: number }
  merge?: { strategy, target }
}
```

**Parallelism is a property of nodes, not a separate node type.** A node with `fan_out: 'all'` spawns multiple tokens. A node with `fan_in: 'all'` waits for sibling tokens and merges them.

### Action Types

Actions are the building blocks nodes execute:

| Action             | Purpose                                    |
| ------------------ | ------------------------------------------ |
| **llm_call**       | Call an LLM with a prompt spec             |
| **mcp_tool**       | Invoke an MCP server tool                  |
| **http_request**   | Make HTTP requests to external APIs        |
| **human_input**    | Wait for human or agent input (gate)       |
| **update_context** | Transform data (pure functions on context) |
| **write_artifact** | Persist typed output                       |
| **workflow_call**  | Invoke another WorkflowDef (sub-workflow)  |
| **vector_search**  | Semantic search over artifacts             |
| **emit_metric**    | Record metrics for observability           |

### Tokens Track Execution

A token represents a position in the graph. When a workflow starts, it has one token at the initial node. Fan-out creates multiple tokens. Fan-in waits for tokens to arrive and merges them back into one.

```
Start: 1 token
  → fan_out: all (5 judges): 5 tokens
  → fan_in: all (merge): 1 token
  → End
```

Each token tracks its lineage:

```typescript
Token {
  id: string
  path_id: string             // execution path for tracing
  parent_token_id?: string    // which token spawned this
  fan_out_node_id?: string    // which node created this
  branch_index: number        // position (0 to N-1)
  branch_total: number        // total siblings
}
```

### Context Carries State

Every workflow run has a Context:

```typescript
Context {
  input: { ... }      // Immutable, schema-validated inputs
  state: { ... }      // Mutable accumulator for results
  output?: { ... }    // Final output (set before completion)
  artifacts: { ... }  // References to persisted outputs
  _branch?: { ... }   // Present during fan-out execution
}
```

### Parallel Execution: Branch Isolation

During parallel execution, each branch writes to isolated storage. No shared state mutation.

```typescript
_branch: {
  id: "tok_123"            // token id
  index: 2                 // 0-indexed position
  total: 5                 // sibling count
  fan_out_node_id: "judge_node"
  output: { ... }          // isolated output space
  parent?: { ... }         // for nested fan-outs
}
```

At fan-in, the merge strategy combines branch outputs:

```typescript
// On the fan-in node:
merge: {
  source: '*',              // all of _branch.output
  target: 'state.votes',    // where to put it
  strategy: 'append'        // how to combine
}
```

Result:

```typescript
context.state.votes = [
  { _branch_id: "tok_1", choice: "A", rationale: "..." },
  { _branch_id: "tok_2", choice: "B", rationale: "..." },
  { _branch_id: "tok_3", choice: "A", rationale: "..." },
  // ...
];
```

### Artifacts Persist Beyond Workflows

Artifacts are typed, versioned outputs with business value: architecture decision records, research findings, generated code, issue reports. They're project-scoped, persist after workflow completion, and can be indexed for semantic search.

```typescript
Artifact {
  id: string
  project_id: string
  type_id: string
  type_version: number
  content: { ... }
  created_by_workflow_run_id?: string
}
```

## Sub-Workflow Invocation

The `workflow_call` action enables composition. A research pipeline invokes a reasoning routine:

```typescript
// Action definition for calling a sub-workflow
{
  kind: 'workflow_call',
  implementation: {
    workflow_def_id: 'react_reasoning_v2',
    version: 3,
    on_failure: 'catch'
  }
}

// Node using the action
{
  action_id: 'call_react_v2',
  input_mapping: {
    "task": "state.research_question",
    "tools": "state.available_mcp_servers"
  },
  output_mapping: {
    "state.findings": "output.findings"
  }
}
```

### Context Isolation

Sub-workflows get fresh context:

- `input`: Built from parent's `input_mapping`
- `state`: Empty
- `artifacts`: Empty (unless `inherit_artifacts: true`)

Sub-workflows set `context.output` before completing. Parent maps from `output.*`.

### Dynamic Dispatch

Select workflow at runtime:

```typescript
implementation: {
  workflow_def_id: { from_context: "state.selected_strategy" },
  version: { from_context: "state.strategy_version" }
}
```

### Failure Handling

```typescript
implementation: {
  workflow_def_id: 'react_v2',
  on_failure: 'catch'  // don't propagate failure
}

// Parent can branch on error via transition condition
condition: {
  type: 'exists',
  field: { path: 'state.error' }
}
```

## Execution Model

### Durable Object Coordination

Each workflow run is managed by a Cloudflare Durable Object that:

- Maintains authoritative state (context, tokens)
- Tracks fan-in synchronization (waiting for all branches)
- Emits events for observability
- Persists to SQLite for durability

### Worker Execution

Actual work happens in Workers:

1. DO enqueues `WorkflowTask` to Cloudflare Queue
2. Worker picks up task, executes action (LLM call, API request, etc.)
3. Worker returns `WorkflowTaskResult` to DO
4. DO updates state, advances tokens, enqueues next tasks

This separation means the DO is a lightweight coordinator while Workers handle compute-intensive operations in parallel.

### Task Results Stage Output

Workers don't write directly to shared context. Output goes to `WorkflowTaskResult.output_data`. The DO collects results and applies the merge strategy at fan-in nodes.

```typescript
WorkflowTaskResult {
  token_id: string
  status: 'success' | 'failure'
  output_data: { vote: "A", rationale: "..." }  // staged here
}
```

## Composition Patterns

### Multi-Judge Consensus

```
Node (fan_out: all, 5 judges)
  → LLM call (evaluate candidates)
  → Node (fan_in: all, merge: collect)
→ Compute (tally winner)
```

### Two-Phase: Ideation + Judging

```
Node (fan_out: all, 3 ideators)
  → LLM call (generate solution)
  → Node (fan_in: all, collect candidates)
→ Node (fan_out: all, 5 judges)
  → Human input (judge votes on candidates)
  → Node (fan_in: all, collect votes)
→ Compute (determine winner)
```

### Research Pipeline with Reasoning

```
Node (vector_search)
  → workflow_call (react_v2)  // agent investigates sources
      input: { task, sources }
      output: { findings }
  → Human input (reviewer approves)
  → workflow_call (tree_of_thought_v1)  // explore implications
      input: { findings }
      output: { recommendations }
  → write_artifact (final report)
```

### Approval Gate

```
Node (execute action)
  → Human input (reviewer decides)
  → Transition: approved? → Continue
  → Transition: rejected? → Rollback
```

### Dynamic Strategy Selection

```
Compute (select strategy based on task complexity)
  → workflow_call (${state.selected_strategy})
      input: { task }
      output: { result }
  → Compute (process result)
```

## Loops

Transitions can loop back to earlier nodes:

```typescript
TransitionDef {
  from_node_id: "check_done",
  to_node_id: "react_step",
  condition: { /* not done */ },
  loop_config: {
    max_iterations: 10,
    timeout_ms: 300000
  }
}
```

Loop state is tracked in context:

```typescript
_loop: {
  node_id: "check_done",
  iteration: 3,
  max_iterations: 10,
  started_at: "2024-01-15T..."
}
```

## Event Sourcing

Every state change emits an event:

```typescript
EventKind =
  | 'workflow_started' | 'workflow_completed' | 'workflow_failed'
  | 'node_started' | 'node_completed' | 'node_failed'
  | 'token_spawned' | 'token_merged' | 'token_cancelled'
  | 'subworkflow_started' | 'subworkflow_completed'
  | 'artifact_created' | 'context_updated'
  | ...
```

This enables:

- Full replay for debugging
- Live UI updates via WebSocket
- Audit trails
- Time-travel debugging

## Durability & Scale

Wonder is designed for long-running workflows (hours to days) with massive parallelism (100+ concurrent branches).

### Tiered Storage

Events flow through temperature tiers:

```
DO SQLite (hot)     Active run events, sub-ms access
    ↓               On workflow completion
D1 (warm)           Recent completed runs, queryable
    ↓               After retention period
R2 (cold)           Archived events, bulk retrieval
```

The DO only holds events for **active runs**. Completed runs move to D1 immediately, keeping DO storage bounded.

### Snapshots for Fast Recovery

Replaying 50k events to rebuild state is slow. Snapshots checkpoint context + tokens periodically:

```typescript
Snapshot {
  after_sequence_number: number  // replay from here
  context: Context
  tokens: Token[]
  created_at: string
}
```

Recovery = load latest snapshot + replay events after `sequence_number`.

Snapshot frequency is configurable per project:

```typescript
snapshot_policy: {
  every_n_events: 100,      // snapshot every 100 events
  every_n_seconds: 60,      // or every minute
  on_fan_in_complete: true  // natural checkpoint after merge
}
```

Fan-in nodes (where `fan_in: 'all'` waits for all branches) are natural snapshot points—state is consistent, all branches merged.

### Event Compaction for Parallel Branches

Instead of emitting N individual events during fan-out execution, branch results are staged in `WorkflowTaskResult`. A single `fan_in_completed` event captures the summary:

```typescript
{
  kind: 'fan_in_completed',
  payload: {
    fan_out_node_id: "judge_panel",
    branches_merged: 100,
    merge_result_path: "state.votes"
    // Individual results are in context, not event payload
  }
}
```

### Live UI Efficiency

The full event stream is for replay and debugging. Live UI receives batched summaries:

```typescript
// DO batches updates, sends every 500ms
{
  type: 'progress_update',
  completed_branches: 47,
  total_branches: 100,
  latest_events: [/* last 5 only */]
}
```

### Gates and Long Waits

Workflows waiting at Gates:

- Set status to `waiting`
- DO hibernates (minimal resource consumption)
- Resume instantly when input arrives
- Optional timeout triggers escalation or timeout transition

## Platform: Cloudflare

| Service              | Role                                                           |
| -------------------- | -------------------------------------------------------------- |
| **Durable Objects**  | Workflow run coordination, token state, fan-in synchronization |
| **Workers**          | Task execution (LLM calls, HTTP requests, compute)             |
| **Queues**           | Work distribution, retry handling                              |
| **D1**               | Global storage (definitions, artifacts, completed runs)        |
| **Vectorize**        | Semantic search over artifacts                                 |
| **Analytics Engine** | Time-series metrics                                            |

## What Wonder Enables

- **Composition**: Build complex pipelines from reusable library workflows
- **Experimentation**: Compare reasoning strategies by querying results across runs
- **Observability**: See exactly what happened, replay any execution
- **Scale**: 100+ parallel judges, multi-day research pipelines, thousands of LLM calls
- **Human-in-the-loop**: Human input nodes pause execution for review, approval, or input
- **Versioning**: Pin workflow versions, upgrade without breaking dependents
- **Isolation**: Projects are fully isolated; sub-workflows get fresh context
