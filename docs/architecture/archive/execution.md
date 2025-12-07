# Execution

## Loading

**At run start:**

- Load `WorkflowDef`, `NodeDef`, `TransitionDef` (by `workflow_def_id`)
- Cache in DO memory for run lifetime

**On-demand:**

- `ActionDef`, `PromptSpec`, `ModelProfile`, `ArtifactType` loaded when needed
- Never load full artifact content or historical events into DO

## Transition Evaluation

- Query transitions by `from_node_id`, ordered by `priority` ascending (1 = first)
- First matching condition wins, token moves to `to_node_id`
- No match = workflow error (forces explicit default transition)
- `foreach` on transition creates one token per collection item

## Terminal Detection

- Node with zero outgoing transitions = terminal node
- Last active token completing terminal node = workflow complete
- Multiple terminal nodes supported (parallel completion paths)

## Token Lifecycle

```
Created → Active → [Waiting at Fan-in] → Completed/Cancelled
```

- Token created: at workflow start (initial node) or by fan-out
- Token active: executing current node, evaluating transitions
- Token waiting: arrived at fan-in node, waiting for siblings
- Token completed: reached terminal node or merged at fan-in
- Token cancelled: early completion in m_of_n, or workflow failure

## Fan-out

- `fan_out: 'all'` spawns tokens equal to branch count
- Each token gets isolated `_branch` context with `index`, `total`, `fan_out_node_id`
- `fan_out: 'first_match'` evaluates transitions, takes first match (no parallelism)

## Fan-in Synchronization

- Sibling tokens identified by: `fan_out_node_id` + `workflow_run_id`
- Arriving tokens transition to `waiting_at_fan_in` status
- Last sibling arrival triggers merge
- `fan_in: 'any'` = first arrival triggers (others cancelled)
- `fan_in: 'all'` = all siblings required
- `fan_in: { m_of_n: N }` = first N arrivals trigger, rest cancelled or abandoned per `on_early_complete`

## Merge Strategies

Applied when fan-in completes, writes to `context.state[target]`:

- `append`: array of branch outputs `[output1, output2, ...]`
- `merge_object`: shallow merge `{ ...output1, ...output2, ... }`
- `keyed_by_branch`: object keyed by branch index `{ "0": output1, "1": output2 }`
- `last_wins`: last sibling's output overwrites

## State Flow

- **Outside fan-out**: `output_mapping` writes directly to `context.state`
- **Inside fan-out**: `output_mapping` writes to `_branch.output` (isolated per token)
- **After fan-in**: merge strategy applies `_branch.output` from siblings → `context.state[target]`
- `_branch` cleared after merge completes

## Context Storage

- Every workflow/sub-workflow gets own DO with SQLite Transactional Storage
- Schema mapped: scalars → columns, arrays → tables, objects → flattened/normalized
- Workers send updates; DO applies via `UPDATE`/`INSERT`/`DELETE`
- SQLite validates types, constraints, foreign keys natively
- Single row per run, updated in place
- Transition conditions query against columns/tables directly
- Ephemeral (run lifetime); snapshots to D1 per `ProjectSettings.snapshot_policy`

## Event Persistence

- Coordinator calls event service via RPC for each significant state change
- Event service persists to D1 for queryable history
- Metrics sent to Analytics Engine for time-series analysis
- Events batched at event service level for efficiency
- WebSocket streaming handled by coordinator (not queued)

## Sub-workflows

- `workflow_call` invokes a WorkflowDef as part of parent run
- Each sub-workflow gets separate DO with isolated SQLite storage
- Cannot execute independently; always part of parent workflow run
- `input_mapping` maps parent context → sub-workflow input (schema-validated)
- `output_mapping` maps sub-workflow output → parent context state
- `inherit_artifacts: false` by default
- `on_failure: 'propagate'` default (sub-workflow error fails parent node)

## Task Execution

- Coordinator calls executor service via RPC with `WorkflowTask`
- Executor executes action synchronously and returns `WorkflowTaskResult`
- No queue buffering; direct RPC call for immediate execution
- Coordinator receives result and updates state/tokens
- Parallel execution via multiple concurrent RPC calls

## Error Handling

- Retries at executor level per `execution.retry_policy` in ActionDef
- Exhausted retries return `WorkflowTaskResult` with `status: 'failure'`
- Coordinator receives failure result, transitions can match on `state._last_error`
- No retry policy = fail immediately on error
- Timeout enforced at executor via `execution.timeout_ms`
- RPC timeout handled by coordinator (fallback to failure)
