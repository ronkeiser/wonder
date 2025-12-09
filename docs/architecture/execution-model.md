# Execution Model

## Overview

Wonder has a layered execution model. Each layer has distinct responsibilities, constraints, and runtime characteristics.

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

Every execution path traverses all five layers. Simple cases are just trivial at each layer—a workflow with one node, a task with one step.

## The Layers

### WorkflowDef

Graphs of nodes connected by transitions. Supports parallelism, fan-out/fan-in, human gates, sub-workflow invocation. State is durable—stored in DO SQLite, survives crashes, enables replay. Coordinated by a Durable Object.

Workflows are for orchestration: branching logic, parallel exploration, human checkpoints, long-running processes.

### Node

A point in the workflow graph. Each node executes exactly one task. Nodes don't contain logic—they specify what task to run and how to map data in and out of workflow context.

### TaskDef

Linear sequences of steps executed by a single worker. State is in-memory—ephemeral, fast, no coordination overhead. Supports retries at the task level and simple conditional logic (if/else, on_failure).

Tasks are for reliable operations: bundling an action with its verification, retrying a sequence atomically, keeping tight loops out of the coordinator.

### Step

A point in a task sequence. Each step executes exactly one action. Steps specify what action to run, how to map data, and what to do on failure (abort, retry task, continue).

### ActionDef

Atomic operations: LLM calls, shell commands, HTTP requests, context updates. Actions have no internal structure. They execute and return a result.

## Why Tasks Exist

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

## Comparison

| Aspect        | Workflow                         | Task                             |
| ------------- | -------------------------------- | -------------------------------- |
| Execution     | Coordinator orchestrates workers | Single worker runs to completion |
| State         | DO SQLite (durable)              | In-memory (ephemeral)            |
| Parallelism   | Fan-out/fan-in                   | None                             |
| Branching     | Full graph routing               | Simple if/else                   |
| Human gates   | Yes                              | No                               |
| Sub-workflows | Yes                              | No                               |
| Sub-tasks     | Yes (nodes execute tasks)        | No (flat sequence)               |
| Retry scope   | Per-node                         | Whole task                       |
| Duration      | Seconds to days                  | Milliseconds to minutes          |

## When to Use Each

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

## Uniform Structure

The layering is uniform. A node always executes a task. A step always executes an action. This eliminates special cases:

- No "should this node run an action directly or go through a task?"
- No "is this a simple action or a composite?"
- Every node gets task-level retry semantics automatically
- Verification can be added to any operation without restructuring

A one-step task is not overhead—it's consistency.

## Example: File Edit

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

## Execution Flow

```
Coordinator (DO)
│
├─ Evaluates transitions, selects node
├─ Reads workflow context
├─ Applies node.input_mapping → task input
├─ Dispatches: { task_id, task_version, input }
│
▼
Worker
│
├─ Loads TaskDef + Steps (ordered by ordinal)
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
Coordinator (DO)
│
├─ Receives task result
├─ Applies node.output_mapping → workflow context
└─ Advances token, evaluates next transitions
```

## Summary

| Layer       | Contains           | Responsibility                            |
| ----------- | ------------------ | ----------------------------------------- |
| WorkflowDef | Nodes, Transitions | Orchestration, parallelism, durability    |
| Node        | —                  | Maps context to/from task                 |
| TaskDef     | Steps              | Reliable sequences, retries, verification |
| Step        | —                  | Maps context to/from action               |
| ActionDef   | —                  | Atomic operations                         |

Workflows handle complexity. Tasks handle reliability. Actions handle execution.
