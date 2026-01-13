# Execution Model

## Overview

Wonder supports two execution models that share infrastructure but differ in what drives decisions:

- **Workflows**: Graph-driven execution coordinated by WorkflowCoordinator
- **Agents**: LLM-driven execution coordinated by Conversation

Both follow the same pattern: receive → decide → dispatch → wait → resume. The difference is what drives "decide" — graph traversal for workflows, LLM reasoning for agents.

## Workflow Execution

Workflows have a layered execution model. Each layer has distinct responsibilities, constraints, and runtime characteristics.

```
WorkflowDef
    ↓ contains
  Node
    ↓ executes
  Task
    ↓ contains
  Step
    ↓ executes
  ActionDef
```

Every execution path traverses all five layers. Simple cases are just trivial at each layer—a workflow with one node, a task with one step.

### The Layers

**WorkflowDef**: Graphs of nodes connected by transitions. Supports parallelism, fan-out/fan-in, human gates, sub-workflow invocation. State is durable—stored in DO SQLite, survives crashes, enables replay. Coordinated by WorkflowCoordinator.

**Node**: A point in the workflow graph. Each node executes exactly one task. Nodes don't contain logic—they specify what task to run and how to map data in and out of workflow context.

**Task**: Linear sequences of steps executed by a single worker. State is in-memory—ephemeral, fast, no coordination overhead. Supports retries at the task level and simple conditional logic (if/else, on_failure).

**Step**: A point in a task sequence. Each step executes exactly one action. Steps specify what action to run, how to map data, and what to do on failure (abort, retry task, continue).

**ActionDef**: Atomic operations: LLM calls, shell commands, HTTP requests, context updates. Actions have no internal structure. They execute and return a result.

### Why Tasks Exist

The original model was Node → Action. Every action required a coordinator round-trip:

```
Coordinator dispatches → Worker executes → Coordinator receives
~50ms overhead per node
```

For a file edit with verification:

```
write_file → read_file → assert_match
3 nodes = 3 round-trips = 150ms overhead
```

An agent making 50 edits pays 7.5 seconds in pure orchestration.

Tasks collapse this:

```
Coordinator dispatches → Worker executes entire task → Coordinator receives
1 round-trip = 50ms overhead
```

The worker runs all three steps in memory. Same result, one-third the overhead.

## Agent Execution

Agents have a simpler execution model. The agent loop is built into Conversation, not expressed as a workflow graph.

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

**Persona**: Reusable configuration — system prompt, tools, memory configuration. Lives in libraries.

**Agent**: Living instance — persona plus accumulated memory, scoped to projects.

**Conversation**: Session with an agent. Contains turns and accumulated context.

**Turn**: One cycle of the agent loop — user input through agent response.

**Message**: User or agent utterance within a turn.

### The Agent Loop

Conversation executes a fixed loop:

```
receive → assemble context → LLM decides → execute → extract memories → respond → wait
```

The agent loop is **not a workflow**. It's built into Conversation as a first-class execution model. Agents *invoke* workflows as tools, but the agent loop itself is not expressed as a graph.

### How Agents Use Workflows

Context assembly and memory extraction are workflows — but they're **hooks called by the agent loop**, not the agent loop itself:

```
Conversation receives user message
  │
  ├─ Calls contextAssemblyWorkflowId → workflow runs, returns assembled context
  │
  ├─ LLM call with context + tools + history
  │   │
  │   └─ If tool_use → dispatch to tool's target
  │       ├─ tool.taskId → Executor
  │       ├─ tool.workflowId → WorkflowCoordinator
  │       └─ tool.agentId → another Conversation
  │
  ├─ Calls memoryExtractionWorkflowId → workflow runs, returns facts to store
  │
  └─ Respond to user
```

The platform provides the agent loop structure. Libraries provide the workflows that plug into it.

## Comparison: Workflows vs Agents

| Aspect           | Workflow (WorkflowCoordinator)           | Agent (Conversation)                          |
| ---------------- | ---------------------------------- | ---------------------------------------- |
| Decision driver  | Graph traversal (deterministic)    | LLM reasoning (non-deterministic)        |
| State            | Fixed tables (tokens) + schema-driven context | Fixed tables (turns, messages) + schema-driven memory |
| Instance scope   | One workflow run                   | One agent (many conversations)           |
| Parallelism      | Fan-out/fan-in                     | None (sequential turns)                  |
| Human gates      | Yes (token pauses)                 | Natural (multi-turn conversation)        |
| Duration         | Seconds to days                    | Sessions span days to weeks              |
| Dispatches to    | Executor, WorkflowCoordinator, Conversation   | Executor, WorkflowCoordinator, Conversation         |

## Unified Dispatch

Both WorkflowCoordinator and Conversation dispatch to the same targets:

- **Executor** — for tasks (stateless worker execution)
- **WorkflowCoordinator** — for sub-workflows (nested graph execution)
- **Conversation** — for agent invocation (LLM-driven subtasks)

This creates a unified dispatch layer where workflows can invoke agents and agents can invoke workflows.

## Workflow Execution Details

### Comparison: Workflow vs Task

| Aspect        | Workflow                         | Task                             |
| ------------- | -------------------------------- | -------------------------------- |
| Execution     | Coordinator orchestrates workers | Single worker runs to completion |
| State         | DO SQLite (durable)              | In-memory (ephemeral)            |
| Parallelism   | Fan-out/fan-in                   | None                             |
| Branching     | Full graph routing               | Simple if/else                   |
| Human gates   | Yes (token pauses)               | No (use workflow nodes)          |
| Sub-workflows | Yes                              | No                               |
| Sub-tasks     | Yes (nodes execute tasks)        | No (flat sequence)               |
| Retry scope   | Per-node                         | Whole task                       |
| Duration      | Seconds to days                  | Milliseconds to minutes          |

### When to Use Each

**Workflows** for:

- Processes with multiple possible paths
- Parallel execution (judges, exploration)
- Human checkpoints
- Long-running operations
- Composition of complex sub-workflows

**Tasks** for:

- Atomic operations that should succeed or fail together
- Actions that need verification (write + read-back + assert)
- Retry loops that should restart from the beginning
- Tight sequences where coordinator overhead matters

### Retry Model

Retries operate at two distinct levels with sharp boundaries:

**Infrastructure Retry (ActionDef)**: Handle transient failures—network errors, rate limits, provider 5xx errors. Automatic and invisible to task logic. The action handler retries the operation within the same step execution.

**Business Retry (Task)**: Handle wrong outputs—invalid JSON, failed assertions, schema violations. Explicit and visible. The entire task restarts from step 0 with fresh context.

**Step-Level on_failure**: Routing only, not retry. Options:
- `abort`: Task fails, no retry
- `retry`: Signal coordinator to retry entire task (if `Task.retry` allows)
- `continue`: Log error, proceed to next step

### Timeout Model

Timeouts are enforced at multiple layers:

**Action-Level**: Executor enforces via AbortController. Prevents individual actions from hanging.

**Task-Level**: Platform terminates worker if exceeded. No graceful shutdown.

**Workflow-Level**: Coordinator enforces via DO alarms. Catches graph-level bugs (infinite loops, exponential fan-out).

**Synchronization Timeout**: Controls wait time for siblings at fan-in merge points.

### Uniform Structure

The layering is uniform. A node always executes a task. A step always executes an action. This eliminates special cases:

- No "should this node run an action directly or go through a task?"
- No "is this a simple action or a composite?"
- Every node gets task-level retry semantics automatically
- Verification can be added to any operation without restructuring

A one-step task is not overhead—it's consistency.

### Example: File Edit

Without tasks (3 coordinator round-trips):

```
Node: write_file → Node: read_file → Node: assert_match
```

With tasks (1 coordinator round-trip):

```
Node: write_file_verified
  → Step: write_file
  → Step: read_file
  → Step: assert_match (on_failure: retry)
```

The task bundles the operation with its verification. If assertion fails, the entire task retries. The workflow sees one node that either succeeds or fails.

### Workflow Execution Flow

```
WorkflowCoordinator
│
├─ Evaluates transitions, selects node
├─ Reads workflow context
├─ Applies node.input_mapping → task input
├─ Dispatches: { task_id, task_version, input }
│
▼
Executor (Worker)
│
├─ Loads Task + Steps (ordered by ordinal)
├─ Initializes in-memory context: { input, state: {}, output: {} }
├─ For each step:
│   ├─ Evaluate condition (skip if needed)
│   ├─ Apply step.input_mapping → action input
│   ├─ Execute action
│   ├─ Apply step.output_mapping → task context
│   └─ Handle failure (abort/retry/continue)
├─ On retry: reset context, restart from step 0
├─ On success: return context.output
│
▼
WorkflowCoordinator
│
├─ Receives task result
├─ Applies node.output_mapping → workflow context
└─ Advances token, evaluates next transitions
```

## Summary

| Coordinator   | Decision Driver                   | State                              | Dispatches to                    |
| ------------- | --------------------------------- | ---------------------------------- | -------------------------------- |
| WorkflowCoordinator | Graph traversal (deterministic)   | Fixed (tokens) + schema-driven context | Executor, WorkflowCoordinator, Conversation |
| Conversation       | LLM reasoning (non-deterministic) | Fixed (turns, messages) + schema-driven memory | Executor, WorkflowCoordinator, Conversation |

| Layer       | Contains           | Responsibility                            |
| ----------- | ------------------ | ----------------------------------------- |
| WorkflowDef | Nodes, Transitions | Orchestration, parallelism, durability    |
| Node        | —                  | Maps context to/from task                 |
| Task        | Steps              | Reliable sequences, retries, verification |
| Step        | —                  | Maps context to/from action               |
| ActionDef   | —                  | Atomic operations                         |

Workflows handle orchestration. Agents handle conversation. Tasks handle reliability. Actions handle execution.
