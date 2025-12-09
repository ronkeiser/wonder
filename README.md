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
│   ├── Repos
│   │   └── api-service
│   ├── Artifacts
│   ├── Workflows
│   │   ├── implement_feature
│   │   └── code_review
│   └── Settings
├── Project (ML Platform)
│   └── ...
└── Settings (allowed providers, budgets)
```

**Workspace** is the top-level container. It defines allowed model providers, MCP servers, and budget limits that apply to all projects within it.

**Project** is an isolated workspace containing repos, artifacts, workflows, and runs. Projects have their own settings for rate limits, default models, and budgets.

**Workflow** binds a graph definition to a project, adding triggers (webhook, schedule, event) and enabling runs.

### Library

Reusable definitions live in libraries:

```
Library (wonder-patterns)
├── Workflows
│   ├── react_reasoning_v2
│   ├── tree_of_thought_v1
│   └── debate_v2
├── Tasks
│   ├── write_file_verified
│   ├── run_tests
│   └── str_replace
└── Actions
    └── ...
```

Libraries can be global (shared across all workspaces) or workspace-private. Projects reference library definitions by ID, optionally pinning to a specific version.

## Execution Model

Wonder has a layered execution model:

```
WorkflowDef
    ↓ contains
  Node
    ↓ executes
  TaskDef
    ↓ contains
  Step
    ↓ executes
  ActionDef
```

**WorkflowDef**: Graphs of nodes and transitions. Supports parallelism, fan-out/fan-in, human gates, sub-workflows. State is durable (DO SQLite). Coordinated by a Durable Object.

**Node**: A point in the workflow graph. Each node executes exactly one task.

**TaskDef**: Linear sequences of steps executed by a single worker. State is in-memory. Supports retries and simple conditionals. Tasks bundle operations with verification.

**Step**: A point in a task sequence. Each step executes exactly one action.

**ActionDef**: Atomic operations—LLM calls, shell commands, HTTP requests, context updates.

Every execution path traverses all five layers. Simple cases are trivial at each layer.

### Why Tasks?

Workflows coordinate. Tasks execute reliably. The separation matters for performance.

A file edit with verification as three workflow nodes requires three coordinator round-trips (~150ms overhead). As a single task with three steps, it's one round-trip (~50ms overhead). An agent making 50 edits saves 5 seconds in pure orchestration.

Tasks also provide atomic retry semantics. If verification fails, the entire task retries—write, read-back, assert—as a unit.

## Workflows Are Graphs

A workflow is a directed graph of nodes connected by transitions. Nodes execute tasks. Transitions route execution based on conditions.

```
Node: generate_candidates
  → Transition (fan_out, spawn_count: 5)
  → Node: judge_candidate
  → Transition (fan_in, wait_for: all, merge: append)
  → Node: select_winner
```

### Transitions Control Everything

Transitions handle all routing logic:

- **Conditions**: Route based on context state
- **Priority tiers**: Same priority = parallel, different = sequential fallback
- **Fan-out**: `spawn_count` (static) or `foreach` (dynamic over collection)
- **Fan-in**: `wait_for` (any | all | m_of_n) with merge strategies
- **Loops**: Back-edges with iteration limits

Nodes are simple—they just execute tasks and map data.

### Tokens Track Execution

A token represents a position in the graph. When a workflow starts, it has one token at the initial node. Fan-out creates multiple tokens. Fan-in waits for tokens and merges them.

```
Start: 1 token
  → fan_out (5 judges): 5 tokens
  → fan_in (merge): 1 token
  → End
```

Each token tracks its lineage: parent token, fan-out transition, branch index, branch total.

### Context Carries State

Every workflow run has a context:

- `input`: Immutable, schema-validated inputs
- `state`: Mutable accumulator for intermediate results
- `output`: Final output (set before completion)
- `artifacts`: References to persisted outputs

Context is stored as SQL tables in the coordinator's SQLite database, driven by JSONSchema. During fan-out, each token writes to isolated branch tables. At fan-in, merge strategies combine results.

## Action Types

Actions are the atomic operations that steps execute:

| Action           | Purpose                                |
| ---------------- | -------------------------------------- |
| `llm_call`       | Call an LLM with a prompt spec         |
| `shell_exec`     | Execute a command in a container       |
| `mcp_tool`       | Invoke an MCP server tool              |
| `http_request`   | Make HTTP requests to external APIs    |
| `human_input`    | Wait for human or agent input          |
| `update_context` | Transform data (pure functions)        |
| `write_artifact` | Persist typed output                   |
| `workflow_call`  | Invoke another workflow (sub-workflow) |
| `vector_search`  | Semantic search over artifacts         |

## Containers

Workflows can provision containers for agents to execute shell commands—editing code, running tests, deploying. Containers are workflow-level resources with linear ownership.

**One ContainerDO per repo.** Each repo has a dedicated Durable Object managing its container lifecycle.

**Ownership rules:**

- Single owner at any moment
- Explicit transfer via `pass_resources` on `workflow_call`
- No parallel access—extract data to context before fan-out

**Git-based hibernation.** Container state is git state. Before hibernation, ensure working directory is committed, record SHA, destroy container. On resume, provision fresh container, checkout SHA, install dependencies.

See [Containers](./containers.md) for details.

## Source Hosting

Wonder is fully Cloudflare-native. Code lives in R2 and D1, not GitHub.

**Architecture:**

- Git objects (blobs, trees, commits) stored in R2, keyed by SHA
- Refs (branches, tags) stored in D1
- isomorphic-git with custom R2/D1 backend
- pnpm store shared in R2 for fast installs

**Benefits:**

- Sub-second container provisioning (no network clone)
- Unified observability (commits correlate with workflow events)
- No external dependencies or credentials

See [Source Hosting](./source-hosting.md) for details.

## Project Resources

Each project contains:

- **Code repos**: One or more, for source code
- **Artifacts repo**: Exactly one (auto-created), for documents, research, decisions
- **Workflows**: Bound definitions with triggers

Code repos and artifacts repo share the same git infrastructure. They're separated for UX clarity.

**Branch-based isolation.** Each workflow run gets its own branch (`wonder/run-{run_id}`). Multiple workflows can operate on the same repo concurrently—each on its own branch. Merge requires exclusive access to the target ref.

See [Project Resources](./project-resources.md) for details.

## Agent Environment

Wonder provides container primitives. Libraries provide project-type intelligence.

A TypeScript pnpm monorepo works differently than a Python uv project. Rather than abstracting these differences, Wonder lets libraries encode project-specific knowledge:

- **Routines**: Edit strategies, test runners, verification loops
- **Workflows**: Feature implementation, bug fixes, refactoring
- **Prompts**: System prompts, planning templates, conventions

The platform doesn't know what `pnpm` is. A library encodes that `pnpm test` runs tests, how to parse output, and what to do on failure.

See [Agent Environment](./agent-environment.md) for details.

## Sub-Workflow Invocation

The `workflow_call` action enables composition. A research pipeline invokes a reasoning routine:

```
Node: investigate
  action: workflow_call
  implementation:
    workflow_def_id: react_reasoning_v2
    pass_resources: [dev_env]
  input_mapping:
    task: state.research_question
  output_mapping:
    state.findings: output.findings
```

**Context isolation.** Sub-workflows execute with fresh context. Input is mapped from parent. Output is mapped back.

**Resource transfer.** Container ownership transfers for the call's duration and returns when the sub-workflow completes.

**Dynamic dispatch.** Select workflow at runtime via `from_context` references.

## Execution Infrastructure

### Durable Object Coordination

Every workflow run gets its own Coordinator DO implementing the Actor Model:

- Maintains authoritative state (context, tokens)
- Tracks fan-in synchronization
- Emits events for observability
- Dispatches tasks to workers

The coordinator is lightweight—decision logic only. Actual work happens in workers.

### Worker Execution

Workers execute tasks:

1. Receive task definition and inputs
2. Execute steps sequentially
3. Handle retries and conditionals
4. Return result to coordinator

Workers are stateless. Task state is in-memory for the task's duration.

### Container Execution

Shell commands route through ContainerDO:

1. Worker calls `containerStub.exec(run_id, command, timeout)`
2. ContainerDO validates ownership
3. ContainerDO forwards to container's shell server
4. Result returns to worker

## Event Sourcing

Every state change emits an event:

- `workflow_started`, `workflow_completed`, `workflow_failed`
- `node_started`, `node_completed`, `node_failed`
- `token_spawned`, `token_merged`, `token_cancelled`
- `subworkflow_started`, `subworkflow_completed`
- `artifact_created`, `context_updated`

This enables full replay, live UI updates, audit trails, and time-travel debugging.

## Platform: Cloudflare

| Service          | Role                                        |
| ---------------- | ------------------------------------------- |
| Durable Objects  | Workflow coordination, container lifecycle  |
| Workers          | Task execution                              |
| D1               | Definitions, refs, metadata, completed runs |
| R2               | Git objects, pnpm store, large artifacts    |
| Vectorize        | Semantic search over artifacts              |
| Analytics Engine | Time-series metrics                         |
| Containers       | Agent execution environment                 |

## What Wonder Enables

- **Composition**: Build complex pipelines from reusable workflows, tasks, and actions
- **Reliability**: Tasks bundle operations with verification and atomic retries
- **Experimentation**: Compare strategies by querying results across runs
- **Observability**: See exactly what happened, replay any execution
- **Scale**: 100+ parallel judges, multi-day research pipelines, thousands of LLM calls
- **Human-in-the-loop**: Gates pause execution for review, approval, or input
- **Versioning**: Pin versions, upgrade without breaking dependents
- **Isolation**: Projects are fully isolated; sub-workflows get fresh context
- **Native development**: Code, artifacts, and workflows in one Cloudflare-native system
