# Wonder

Wonder is an AI orchestration platform that supports two execution models: **deterministic workflows** for structured pipelines, and **conversational agents** for open-ended interaction. Both share the same infrastructure—Durable Objects for coordination, event sourcing for observability, and a unified dispatch layer for execution.

## Why Wonder Exists

AI-assisted development takes two forms:

**Structured pipelines**: Research a problem, generate candidate solutions, evaluate them with multiple judges, synthesize results, wait for human approval. These processes run for hours to days, involve hundreds of LLM calls, require true parallelism, need human checkpoints, and must be observable and replayable.

**Open-ended interaction**: A user converses with an agent that has access to tools, workflows, and memory. The agent decides what to do next based on conversation history and extracted context. Sessions span multiple turns over days or weeks.

Wonder provides the orchestration layer for both.

## Structure

### Workspace → Project → Workflows & Agents

```
Workspace (Acme Corp)
├── Project (Backend Rewrite)
│   ├── Repos
│   │   └── api-service
│   ├── Artifacts
│   ├── Workflows
│   │   ├── implement_feature
│   │   └── code_review
│   ├── Agents
│   │   ├── code_assistant
│   │   └── reviewer
│   └── Settings
├── Project (ML Platform)
│   └── ...
└── Settings (allowed providers, budgets)
```

**Workspace** is the top-level container. It defines allowed model providers, MCP servers, and budget limits that apply to all projects within it.

**Project** is an isolated workspace containing repos, artifacts, workflows, agents, and runs. Projects have their own settings for rate limits, default models, and budgets.

**Workflow** binds a graph definition to a project, adding triggers (webhook, schedule, event) and enabling runs.

**Agent** binds a persona to a project, enabling conversations. Agents can invoke workflows as capabilities and access project resources.

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
├── Tools
│   ├── implement_feature
│   ├── search_code
│   └── run_tests
├── Personas
│   ├── code_assistant
│   └── reviewer
└── Actions
    └── ...
```

Libraries can be global (shared across all workspaces) or workspace-private. Projects reference library definitions by ID, optionally pinning to a specific version.

## Execution Models

Wonder supports two parallel execution models that share the same infrastructure but differ in what drives decisions.

### Workflows: Graph-Driven Execution

```
WorkflowDef
    ↓ contains
  Node
    ↓ executes
  Task
    ↓ contains
  Step
    ↓ executes
  Action
```

**WorkflowDef**: Graphs of nodes and transitions. Supports parallelism, fan-out/fan-in, human gates, sub-workflows. State is durable (DO SQLite). Coordinated by WorkflowCoordinator.

**Node**: A point in the workflow graph. Each node executes exactly one task.

**Task**: Linear sequences of steps executed by a single worker. State is in-memory. Supports retries and simple conditionals. Tasks bundle operations with verification.

**Step**: A point in a task sequence. Each step executes exactly one action.

**Action**: Atomic operations—LLM calls, MCP tools, HTTP requests, context updates.

Every execution path traverses all five layers. Simple cases are trivial at each layer.

### Agents: LLM-Driven Execution

```
Persona
    ↓ instantiated as
  Agent
    ↓ holds
  Conversation
    ↓ contains
  Turn
    ↓ contains
  Message
```

**Persona**: Reusable definition specifying system prompt, available tools, workflow capabilities, and memory configuration. Versioned and stored in libraries.

**Agent**: A persona bound to a project. Has access to project resources and can invoke workflows as capabilities.

**Conversation**: A session with an agent. Durable state in Conversation. Contains turns and accumulated memories.

**Turn**: A request-response cycle within a conversation. User submits a message, agent reasons and acts, then responds.

**Message**: Individual messages within a turn—user input, assistant responses, tool calls, tool results.

### The Same Pattern

Both execution models follow the same coordination pattern:

```
receive → decide → dispatch → wait → resume
```

The difference is what drives "decide":
- **WorkflowCoordinator**: Graph traversal determines next node based on transitions and conditions
- **Conversation**: LLM reasoning determines next action based on conversation and context

Both dispatch to the same targets: Executor (for tasks), WorkflowCoordinator (for sub-workflows), or Conversation (for agent invocation).

### Why Tasks?

Workflows coordinate. Tasks execute reliably. The separation matters for performance.

A file edit with verification as three workflow nodes requires three coordinator round-trips (~150ms overhead). As a single task with three steps, it's one round-trip (~50ms overhead). An agent making 50 edits saves 5 seconds in pure orchestration.

Tasks also provide atomic retry semantics. If verification fails, the entire task retries—write, read-back, assert—as a unit.

## Workflows Are Graphs

A workflow is a directed graph of nodes connected by transitions. Nodes execute tasks. Transitions route execution based on conditions.

```
Node: generate_candidates
  → Transition (siblingGroup: "judges", spawn_count: 5)
  → Node: judge_candidate
  → Transition (synchronization: { strategy: all, siblingGroup: "judges" }, merge: append)
  → Node: select_winner
```

### Transitions Control Everything

Transitions handle all routing logic:

- **Conditions**: Route based on context state
- **Priority tiers**: Same priority = parallel, different = sequential fallback
- **Fan-out**: `siblingGroup` + `spawn_count` (static) or `foreach` (dynamic over collection)
- **Fan-in**: `synchronization` with strategy (any | all | m_of_n) and merge config
- **Loops**: Back-edges with iteration limits via `loopConfig`

Nodes are simple—they just execute tasks and map data.

### Tokens Track Execution

A token represents a position in the graph. When a workflow starts, it has one token at the initial node. Fan-out creates multiple tokens. Fan-in waits for tokens and merges them.

```
Start: 1 token
  → fan_out (5 judges): 5 tokens
  → fan_in (merge): 1 token
  → End
```

Each token tracks its lineage: parent token, path ID, sibling group, branch index, branch total.

### Context Carries State

Every workflow run has a context:

- `input`: Immutable, schema-validated inputs
- `state`: Mutable accumulator for intermediate results
- `output`: Final output (set before completion)
- `artifacts`: References to persisted outputs

Context is stored as SQL tables in the coordinator's SQLite database, driven by JSONSchema. During fan-out, each token writes to isolated branch tables. At fan-in, merge strategies combine results.

## Action Kinds

Actions are the atomic operations that steps execute:

| Kind       | Purpose                                              |
| ---------- | ---------------------------------------------------- |
| `llm`      | Call an LLM with a prompt spec                       |
| `shell`    | Execute commands in a container                      |
| `mcp`      | Invoke an MCP server tool                            |
| `http`     | Make HTTP requests to external APIs                  |
| `human`    | Wait for human or agent input                        |
| `context`  | Transform data (pure functions)                      |
| `artifact` | Read/write/search project artifacts                  |
| `memory`   | Read/write/search agent memory                       |
| `metric`   | Record metrics to Analytics Engine                   |
| `mock`     | Test stub with predefined responses                  |

Note: Sub-workflows are invoked via Node's `subworkflowId`, not an action.

## Containers

Workflows can provision containers for agents to execute shell commands—editing code, running tests, deploying. Containers are workflow-level resources with linear ownership.

**One ContainerDO per resource declaration per run.** Each workflow run provisions its own container instance(s) based on WorkflowDef.resources declarations. Multiple runs can work on the same repo concurrently via branch isolation.

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

## Sub-Workflow and Agent Invocation

Workflows, agents, and tasks can invoke each other, creating a unified dispatch layer.

### Workflow → Workflow

Sub-workflow nodes enable composition. A research pipeline invokes a reasoning routine:

```
Node: investigate
  subworkflowId: react_reasoning_v2
  resourceBindings:
    dev_env: dev_env
  inputMapping:
    task: state.research_question
  outputMapping:
    state.findings: $.findings
```

**Context isolation.** Sub-workflows execute with fresh context. Input is mapped from parent. Output is mapped back.

**Resource transfer.** Container ownership transfers for the call's duration and returns when the sub-workflow completes.

**Dynamic dispatch.** Select workflow at runtime via `from_context` references.

### Agent → Workflow

Agents invoke workflows as capabilities. A code assistant agent uses an `implement_feature` workflow:

```
Agent decides: invoke workflow
  workflowId: implement_feature
  input: { feature: "add dark mode toggle", branch: "feature/dark-mode" }

Agent waits for workflow completion
Agent receives: { branch: "feature/dark-mode", commit: "abc123" }
Agent responds to user with results
```

Agents don't need to know how to implement features—they delegate to workflows that encode the expertise.

### Workflow → Agent

Workflows can invoke agents for open-ended subtasks. A code review workflow uses a reviewer agent:

```
Node: get_review_feedback
  agentId: reviewer
  inputMapping:
    context: state.code_diff
  outputMapping:
    state.feedback: $.response
```

The agent receives context, reasons about it, and returns a response. Useful when the task requires judgment rather than a fixed procedure.

## Execution Infrastructure

### Durable Object Coordination

Every execution gets its own Durable Object implementing the Actor Model:

**WorkflowCoordinator** (one per workflow run):
- Maintains authoritative state (context, tokens)
- Tracks fan-in synchronization
- Evaluates transitions to determine next nodes
- Dispatches tasks to Executor

**Conversation** (one per conversation):
- Maintains conversation state (turns, messages, memories)
- Assembles context for LLM calls
- Reasons via LLM to decide next action
- Dispatches tools, workflows, or agent invocations

Both are lightweight—decision logic only. Actual work happens in Executor or nested DOs.

### Executor

The Executor service executes tasks:

1. Receive task definition and inputs from WorkflowCoordinator or Conversation
2. Execute steps sequentially
3. Handle retries and conditionals
4. Return result to calling DO

Executor is stateless. Task state is in-memory for the task's duration.

### Container Execution

Shell commands route through ContainerDO:

1. Executor calls `containerStub.exec(run_id, command, timeout)`
2. ContainerDO validates ownership
3. ContainerDO forwards to container's shell server
4. Result returns to Executor

## Event Sourcing

Every state change emits an event (dot notation: `category.action`). Events are tagged with `executionType` ('workflow' | 'conversation') for unified storage and filtering.

**Workflow events:**
- `workflow.started`, `workflow.completed`, `workflow.failed`
- `task.dispatched`, `task.completed`, `task.failed`
- `token.created`, `token.completed`, `token.failed`, `token.waiting`
- `fan_out.started`, `fan_in.completed`, `branches.merged`
- `subworkflow.started`, `subworkflow.completed`, `subworkflow.failed`
- `context.updated`, `context.output_applied`

**Conversation events:**
- `conversation.started`, `conversation.completed`
- `turn.started`, `turn.completed`
- `message.user`, `message.assistant`, `message.tool_call`, `message.tool_result`
- `tool.invoked`, `tool.completed`, `tool.failed`
- `memory.extracted`, `memory.recalled`

This enables full replay, live UI updates, audit trails, and time-travel debugging across both execution models.

## Platform: Cloudflare

| Service          | Role                                                              |
| ---------------- | ----------------------------------------------------------------- |
| Durable Objects  | WorkflowCoordinator (workflows), Conversation (conversations), ContainerDO |
| Workers          | Executor service, API routes                                      |
| D1               | Definitions, refs, metadata, completed runs, conversation history |
| R2               | Git objects, pnpm store, large artifacts                          |
| Vectorize        | Semantic search over artifacts and memories                       |
| Analytics Engine | Time-series metrics                                               |
| Containers       | Agent execution environment                                       |

## What Wonder Enables

- **Dual execution**: Deterministic workflows for structured pipelines, LLM-driven agents for open-ended interaction
- **Composition**: Build complex pipelines from reusable workflows, tasks, personas, and actions
- **Interoperability**: Agents invoke workflows as capabilities; workflows invoke agents for judgment
- **Reliability**: Tasks bundle operations with verification and atomic retries
- **Memory**: Agents accumulate memories across turns and conversations via semantic extraction
- **Experimentation**: Compare strategies by querying results across runs
- **Observability**: See exactly what happened, replay any execution (workflows or conversations)
- **Scale**: 100+ parallel judges, multi-day research pipelines, thousands of LLM calls
- **Human-in-the-loop**: Gates pause workflows; agents naturally support multi-turn conversation
- **Versioning**: Pin versions, upgrade without breaking dependents
- **Isolation**: Projects are fully isolated; sub-workflows and agents get fresh context
- **Native development**: Code, artifacts, workflows, and agents in one Cloudflare-native system
