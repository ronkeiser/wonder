# Execution

## Graph Loading

- Nodes and transitions stored in D1, keyed by `workflow_def_id`
- Loaded once at workflow run start, cached in DO memory
- Actions loaded on-demand when nodes execute

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

## Sub-workflows

- `workflow_call` action spawns new WorkflowRun with fresh context
- `input_mapping` on node maps parent context → sub-workflow input (schema-validated)
- Sub-workflow executes independently (may spawn own DO if needed)
- `output_mapping` maps sub-workflow output → parent context state
- `inherit_artifacts: false` by default (sub-workflow sees own project artifacts only)
- `on_failure: 'propagate'` default (sub-workflow error fails parent node)

## Error Handling

- Retries at Worker/task level per `execution.retry_policy` in ActionDef
- Exhausted retries return `WorkflowTaskResult` with `status: 'failure'`
- DO receives failure result, transitions can match on `state._last_error` or similar
- No retry policy = fail immediately on error
- Timeout enforced at Worker via `execution.timeout_ms`
