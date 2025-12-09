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

## Retry Model

Retries operate at two distinct levels with sharp boundaries:

### Infrastructure Retry (ActionDef)

**Purpose:** Handle transient failures—network errors, rate limits, provider 5xx errors.

**Behavior:** Automatic and invisible to task logic. The action handler retries the operation within the same step execution. From the task's perspective, the action just took longer.

**Configuration:** `ActionDef.execution.retry_policy`

**Error classification:**

- Network timeouts, connection failures
- HTTP 429 (rate limit), 500-599 (server errors)
- Provider-specific transient errors

**Non-retryable:** Business errors (400, 401, 403, 404), validation failures, schema mismatches.

### Business Retry (TaskDef)

**Purpose:** Handle wrong outputs—invalid JSON, failed assertions, schema violations, business logic failures.

**Behavior:** Explicit and visible. The entire task restarts from step 0 with fresh context. All steps re-execute.

**Configuration:** `TaskDef.retry`

**Triggered by:** `Step.on_failure = 'retry'` when a step fails.

**Key characteristic:** Fresh attempt. Previous attempt's state is discarded. If you need to preserve state between retry attempts or implement conditional retry logic, use workflow nodes with durable state.

### Step-Level on_failure: Routing Only

`Step.on_failure` is **not a retry mechanism**. It's a routing decision:

- **`abort`**: Task fails, no retry
- **`retry`**: Signal coordinator to retry entire task (if `TaskDef.retry` allows)
- **`continue`**: Log error, proceed to next step

The step itself never retries in isolation. Retry is always at the task level (full reset) or action level (infrastructure only).

## Timeout Model

Timeouts are enforced at three layers, each serving a distinct purpose:

### 1. Action-Level Timeout

**Enforced by:** Executor (AbortController)  
**Configured in:** `ActionDef.execution.timeout_ms`  
**Purpose:** Prevent individual actions from hanging (LLM calls, HTTP requests, shell commands)

The Executor wraps action execution with `AbortController` and enforces the timeout inline. If exceeded, the action fails and step-level `on_failure` determines whether the task aborts, retries, or continues.

### 2. Task-Level Timeout

**Enforced by:** Cloudflare Workers platform  
**Configured in:** `TaskDef.timeout_ms`  
**Purpose:** Limit entire task execution (all steps sequentially)

Platform terminates the worker if task exceeds limit. No graceful shutdown—execution simply stops. Coordinator detects missing response and handles as task failure.

### 3. Workflow-Level Timeout

**Enforced by:** Coordinator (DO alarms)  
**Configured in:** `WorkflowDef.timeout_ms` and `on_timeout`  
**Purpose:** Catch graph-level bugs that action/task timeouts cannot detect

Detects problems like:

- **Infinite loops**: A→B→C→A cycle where each node succeeds but workflow never terminates
- **Exponential fan-out**: Bug causes unbounded token spawning
- **Routing errors**: Correct execution but logic errors prevent completion

**Default behavior:** `on_timeout: 'human_gate'` pauses workflow for review rather than killing it. Humans can inspect state, extend timeout, or abort. This turns timeouts into supervision checkpoints, not catastrophic failures.

### 4. Synchronization Timeout

**Enforced by:** Coordinator (DO alarms)  
**Configured in:** `Transition.synchronization.timeout_ms` and `on_timeout`  
**Purpose:** Control wait time for siblings at fan-in merge points

Measures time from first sibling arrival (not from fan-out), avoiding double-counting execution time. Policies:

- `fail`: All waiting siblings fail, workflow fails
- `proceed_with_available`: Merge completed siblings, mark stragglers as timed out

**Timeout Hierarchy:** Action < Task < Workflow (and synchronization is independent per fan-in)

### When Retry Logic Needs Branching

If you need:

- Different retry strategies per attempt ("first try model A, then try model B")
- State preservation between attempts
- Conditional branching based on failure type
- Parallel retry attempts

You've outgrown tasks. Use workflow nodes and transitions, where you get full graph routing and durable state.

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
