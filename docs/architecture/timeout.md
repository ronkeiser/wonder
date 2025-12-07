# Timeout Strategy

## Overview

Wonder implements a **3-layer timeout strategy** to prevent workflows from hanging indefinitely while allowing flexibility for variable-duration operations. Timeouts are enforced at three levels: workflow execution, node execution, and synchronization.

## Timeout Layers

### 1. Workflow-Level Timeout

Controls the maximum duration for an entire workflow execution, regardless of internal structure.

```typescript
WorkflowDef {
  timeout_ms: number | null,     // Max duration in milliseconds
  on_timeout: 'cancel_all' | 'fail'
}

WorkflowRun {
  timeout_at: number | null,     // Unix timestamp when workflow times out
}
```

**Behavior:**

- On workflow run creation: `timeout_at = now() + definition.timeout`
- Background job checks: `workflow_runs WHERE timeout_at < now()`
- On timeout: transition all active tokens to `timed_out`, apply `on_timeout` policy

**Timeout Policies:**

- `cancel_all` (default): Cancel all active tokens, mark workflow as timed out
- `fail`: Mark workflow as failed, propagate error to parent if subworkflow

**Purpose: Catches graph-level bugs that node timeouts cannot:**

- **Infinite loops**: Workflow has a cycle (A → B → C → A), each node completes successfully but workflow never terminates
- **Exponential fan-out**: Bug causes workflow to spawn unbounded tokens
- **Logic errors**: Correct node execution but incorrect routing leads to endless iteration

**Default:** 1 hour (generous for complex workflows, tight enough to catch runaways)

**Composability with Subworkflows:**

When a workflow is invoked as a subworkflow, the parent node's timeout takes precedence:

```typescript
// Child workflow definition
WorkflowDef 'research-workflow' {
  timeout_ms: 600000  // 10 minutes typical duration
}

// Parent node invokes as subworkflow
Node {
  action_id: 'research_action',  // ActionDef with kind: 'workflow_call'
  timeout_ms: 1800000            // 30 minutes - override for this invocation
}

ActionDef 'research_action' {
  kind: 'workflow_call',
  implementation: {
    workflow_def_id: 'research-workflow'
  }
}
```

**Timeout hierarchy:** Node timeout > ActionDef timeout > Child WorkflowDef timeout. This maintains composability while providing sensible defaults.

### 2. Execution Timeout (Action/Node Level)

Controls how long an individual action can execute before being terminated. Timeouts defined on `ActionDef` can be overridden per-node.

```typescript
ActionDef {
  execution: {
    timeout_ms: number | null,   // Default timeout for this action
  }
}

Node {
  action_id: string,
  timeout_ms?: number | null,    // Override ActionDef timeout
  on_timeout?: 'fail' | 'retry'  // Override ActionDef policy
}
```

**Behavior:**

- Token enters `executing` state with `timeout_at = now() + timeout`
- Background job checks for expired tokens: `state = 'executing' AND timeout_at < now()`
- On timeout: transition token to `timed_out` state and apply `on_timeout` policy

**Timeout Policies:**

- `fail` (default): Mark token as failed, propagate error downstream
- `retry`: Transition back to `pending`, increment retry_count (requires retry limit)

**Recommended Timeouts by Action Type:**

| Action Type    | Recommended Timeout (ms) | Human-Readable | Rationale                                           |
| -------------- | ------------------------ | -------------- | --------------------------------------------------- |
| LLM call       | 120000-300000            | 2-5 minutes    | Most complete in seconds, but allow for rate limits |
| workflow_call  | 1800000-3600000          | 30-60 minutes  | Depends on complexity of child workflow             |
| mcp_tool       | 30000-120000             | 30s-2 minutes  | Fast operations, but allow for network latency      |
| http_request   | 30000-120000             | 30s-2 minutes  | External API calls with network latency             |
| update_context | 5000-30000               | 5-30 seconds   | Pure computation, usually very fast                 |

**Default Behavior:** No default timeout. Workflows must explicitly specify timeouts for long-running or external operations. This prevents accidental infinite hangs while avoiding premature termination of legitimate long-running work.

### 3. Synchronization Timeout (Fan-in Timeout)

Controls how long to wait for siblings to arrive at a synchronization point.

```typescript
// On Transition
synchronization: {
  strategy: 'all' | 'any' | { m_of_n: number },
  sibling_group: string,   // fan_out_transition_id that spawned siblings
  timeout_ms?: number,     // Duration to wait for siblings (milliseconds)
  on_timeout: 'proceed_with_available' | 'fail',
  merge: {
    source: string,        // Path in branch context (e.g., "_branch.output")
    target: string,        // Path in main context (e.g., "state.results")
    strategy: 'append' | 'merge_object' | 'keyed_by_branch' | 'last_wins'
  }
}
```

**Behavior:**

- First sibling to arrive sets `sync_started_at = now()`
- Subsequent siblings check: `now() - sync_started_at > timeout`
- On timeout: apply `on_timeout` policy

**Timeout Policies:**

- `proceed_with_available`: Merge whatever siblings have completed, continue workflow
- `fail`: Transition all waiting siblings to `timed_out`, fail the workflow

**Computed Default Timeout:**

```typescript
// If timeout_ms not specified, compute from action timeout and spawn count
const defaultSyncTimeoutMs = Math.min(
  maxActionTimeoutMs * spawnCount * 1.5, // Allow some serialization overhead
  30 * 60 * 1000, // Cap at 30 minutes (1,800,000ms)
);
```

**Example:** If you spawn 10 tokens to an action with 120,000ms (2-minute) timeout, default sync timeout is `120000 × 10 × 1.5 = 1,800,000ms (30 minutes)`.

**Critical Detail:** Synchronization timeout measures **wait time** (from first sibling arrival), not **total time** (from fan-out). This prevents double-counting execution time.

## Timeout Hierarchy

When multiple timeout layers apply, they enforce different constraints:

1. **Workflow timeout**: Maximum total duration, catches infinite loops
2. **Node timeout**: Maximum time for individual action execution
3. **Synchronization timeout**: Maximum wait time for sibling coordination

**For subworkflows:**

- If node timeout specified: use node timeout (parent controls child duration)
- If node timeout omitted: use child workflow's timeout (child's default applies)
- Synchronization timeouts are always independent per workflow

**Example:**

```typescript
// Workflow with 1h timeout
WorkflowDef {
  timeout_ms: 3600000,  // 1 hour
  nodes: [
    { id: 'A', action_id: 'act1', timeout_ms: 300000 },   // 5 minutes
    { id: 'B', action_id: 'act2', timeout_ms: 600000 },   // 10 minutes
    { id: 'C', action_id: 'act3' }                        // Uses ActionDef default
  ]
}

// If workflow hits 1h mark:
// - All active tokens timeout regardless of node/action configuration
// - Catches case where workflow loops through A→B→C repeatedly
```

## Implementation

### Token Schema Updates

```typescript
Token {
  // ... existing fields
  status: 'pending' | 'dispatched' | 'executing' | 'completed' | 'failed' | 'timed_out' | 'cancelled',
  timeout_at?: number,     // Unix timestamp when this token times out
  fan_out_transition_id?: string,  // Which transition spawned this token
  state_data?: {
    arrived_at: number,
    sync_started_at?: number  // When first sibling arrived (for synchronization)
  }
}
```

### Timeout Detection

Cloudflare Durable Objects provide built-in alarm mechanism for timeout checks:

```typescript
class WorkflowRunDO {
  async alarm() {
    await this.checkTimeouts();

    // Schedule next check
    const nextCheck = Date.now() + 30_000; // 30 seconds
    await this.storage.setAlarm(nextCheck);
  }

  async checkTimeouts() {
    const now = Date.now();

    // 1. Check workflow-level timeout
    const workflowRun = await this.getWorkflowRun();
    if (workflowRun.timeout_at && now > workflowRun.timeout_at) {
      await this.handleWorkflowTimeout(workflowRun);
      return; // Workflow timed out, stop processing
    }

    // 2. Check action execution timeouts
    const executingTokens = await this.db.query(
      `
      SELECT * FROM tokens 
      WHERE status = 'executing' 
      AND timeout_at IS NOT NULL 
      AND timeout_at < ?
    `,
      [now],
    );

    for (const token of executingTokens) {
      await this.handleNodeTimeout(token);
    }

    // 3. Check synchronization timeouts
    const waitingTokens = await this.db.query(`
      SELECT * FROM tokens 
      WHERE status = 'waiting_for_siblings'
    `);

    for (const token of waitingTokens) {
      const { sync_started_at } = token.state_data;
      const syncTimeout = this.getSynchronizationTimeout(token);

      if (sync_started_at && now - sync_started_at > syncTimeout) {
        await this.handleSynchronizationTimeout(token);
      }
    }
  }
}
```

### Workflow Timeout Handling

```typescript
async function handleWorkflowTimeout(workflowRun: WorkflowRun) {
  const definition = await getWorkflowDef(
    workflowRun.workflow_def_id,
    workflowRun.workflow_def_version,
  );

  // Get all active tokens
  const activeTokens = await this.db.query(
    `
    SELECT * FROM tokens
    WHERE workflow_run_id = ?
    AND status NOT IN ('completed', 'failed', 'timed_out', 'cancelled')
  `,
    [workflowRun.id],
  );

  // Transition all to timed_out
  for (const token of activeTokens) {
    await updateToken(token.id, {
      status: 'timed_out',
      state_data: {
        timeout_at: workflowRun.timeout_at,
        reason: 'workflow_timeout',
      },
    });
  }

  // Apply on_timeout policy
  if (definition.on_timeout === 'fail') {
    await markWorkflowFailed(workflowRun.id, 'Workflow exceeded timeout');
  } else {
    // cancel_all (default)
    await markWorkflowTimedOut(workflowRun.id);
  }

  // If this is a subworkflow, notify parent
  if (workflowRun.parent_token_id) {
    await notifyParentOfTimeout(workflowRun.parent_token_id);
  }
}
```

### Node Timeout Handling

```typescript
async function handleExecutionTimeout(token: Token) {
  const node = await getNode(token.node_id);
  const action = await getActionDef(node.action_id, node.action_version);

  const onTimeout = node.on_timeout ?? action.execution.on_timeout ?? 'fail';

  if (onTimeout === 'retry') {
    const retryCount = token.state_data?.retry_count ?? 0;
    const maxRetries = 3; // Configurable

    if (retryCount < maxRetries) {
      // Retry: reset to pending
      await updateToken(token.id, {
        status: 'pending',
        state_data: { retry_count: retryCount + 1 },
        timeout_at: null,
      });
      await dispatchToken(token);
    } else {
      // Max retries exceeded: fail
      await updateToken(token.id, {
        status: 'timed_out',
        state_data: {
          timeout_at: token.timeout_at,
          retry_count: retryCount,
        },
      });
      await handleTokenFailure(token);
    }
  } else {
    // on_timeout = 'fail': mark as timed out
    await updateToken(token.id, {
      status: 'timed_out',
      state_data: { timeout_at: token.timeout_at },
    });
    await handleTokenFailure(token);
  }
}
```

### Synchronization Timeout Handling

```typescript
async function handleSynchronizationTimeout(token: Token) {
  const transition = await getTransition(token.workflow_run_id, token.current_node_id);
  const { on_timeout } = transition.synchronization;

  if (on_timeout === 'proceed_with_available') {
    // Merge completed siblings and continue
    const siblings = await getSiblings(token.workflow_run_id, token.fan_out_transition_id);
    const completed = siblings.filter((s) => s.status === 'completed');

    if (completed.length > 0) {
      // Merge available results
      const mergedOutput = await mergeOutputs(completed, transition.synchronization.merge);

      // Create new token and proceed
      const newToken = await createMergedToken(token, mergedOutput);
      await dispatchToken(newToken);

      // Mark waiting siblings as timed out
      const waiting = siblings.filter((s) => s.status === 'waiting_for_siblings');
      for (const sibling of waiting) {
        await updateToken(sibling.id, {
          status: 'timed_out',
          state_data: { timeout_at: Date.now() },
        });
      }
    } else {
      // No completed siblings: fail
      await failSynchronization(token, 'No siblings completed before timeout');
    }
  } else {
    // on_timeout = 'fail': fail all waiting siblings
    await failSynchronization(token, 'Synchronization timeout exceeded');
  }
}
```

## Edge Cases

### Workflow timeout vs node timeout

If a workflow times out while a node is executing, both timeouts may trigger simultaneously. Workflow timeout takes precedence - all tokens are marked `timed_out` regardless of individual node timeout handling.

### Subworkflow timeout inheritance

When a subworkflow is invoked without an explicit node timeout, the child workflow's definition timeout applies. The child workflow run is independent - it doesn't "inherit" remaining time from the parent.

### Timeout during token creation

If a token times out before being dispatched (stuck in `pending` state due to queue backlog), treat as execution timeout with `on_timeout = 'fail'`.

### Synchronization without timeout

If `synchronization.timeout_ms` is omitted and no action timeout exists to compute from, use default 30-minute cap (1,800,000ms).

### Partial synchronization timeout

When `on_timeout = 'proceed_with_available'` but some siblings are still executing (not waiting), those executing siblings continue running. Their outputs are discarded when they complete (token already proceeded).

### Nested synchronization timeouts

Each synchronization point has independent timeout. A token waiting at fan-in B doesn't inherit timeout from parent fan-in A.

## Observability

Timeout events should be emitted for monitoring:

```typescript
{
  kind: 'token_timed_out',
  token_id: string,
  workflow_run_id: string,
  node_id: string,
  timeout_type: 'workflow' | 'execution' | 'synchronization',
  timeout_duration_ms: number,
  policy_applied: 'cancel_all' | 'fail' | 'retry' | 'proceed_with_available'
}
```

This enables:

- Alerting on frequent timeouts (may indicate under-provisioned timeouts or infrastructure issues)
- Analysis of which actions/nodes/transitions need timeout adjustments
- Debugging workflow hangs and performance issues

## Future Enhancements

- **Adaptive timeouts**: Learn from historical execution times and automatically adjust timeouts
- **Timeout inheritance**: Child subworkflows inherit timeout budget from parent
- **Graceful shutdown**: Signal executors to clean up before hard timeout
- **Timeout escalation**: Warning at 80% of timeout, error at 100%
