# Branching and Parallelism

## Overview

Wonder's branching model is based on **transition-centric control flow**, inspired by Petri nets and BPMN workflow patterns. All branching logic—conditions, parallelism, and replication—is specified on transitions, not nodes.

## Core Principles

1. **Nodes execute tasks** - no branching logic
2. **Transitions control routing** - conditions, spawn counts, priorities
3. **Priority tiers control evaluation** - same priority = parallel dispatch, different priority = sequential tiers
4. **Tokens track lineage** - hierarchical path_id enables fan-in
5. **Fan-in uses path matching** - siblings identified by common fan-out ancestor

## Transition Schema

```typescript
Transition {
  id: string,                 // Unique transition identifier
  from_node_id: string,
  to_node_id: string,
  priority: number,           // Lower = higher priority (1 = first)
  condition?: Condition,      // Structured or CEL expression
  spawn_count?: number,       // How many tokens for this path (default: 1)
  foreach?: {                 // Dynamic iteration over collection
    collection: string,
    item_var: string
  },
  synchronization?: {         // Fan-in behavior for tokens arriving via this transition
    strategy: 'any' | 'all' | { m_of_n: number },
    sibling_group: string,  // Which fan_out_transition_id to synchronize on
    timeout_ms?: number,    // Max wait time for siblings (null = no timeout)
    on_timeout?: 'proceed_with_available' | 'fail',  // Default: 'fail'
    merge?: {
      source: string,         // Path in branch output (e.g., '_branch.output', '_branch.output.choice')
      target: string,         // Where to write merged result (e.g., 'state.votes')
      strategy: 'append' | 'merge_object' | 'keyed_by_branch' | 'last_wins'
    }
  }
}
```

## Branching Patterns

### Pattern 1: Sequential (First Match)

Transitions at different priority levels are evaluated in priority order. The first priority tier that has ANY matches is followed; remaining tiers are skipped.

```typescript
// Node A completes
Transitions (evaluated by priority tiers):
  priority: 1, condition: { approved == true } → Node B
  priority: 2, condition: { rejected == true } → Node C
  priority: 3, (no condition - default) → Node D

// If approved=true: 1 token to Node B (stop, don't evaluate priority 2 or 3)
// If approved=false, rejected=true: 1 token to Node C (stop, don't evaluate priority 3)
// Otherwise: 1 token to Node D
```

**Implementation:** Evaluate transitions by priority tier. At each tier, check all conditions. If ANY match, follow ALL matches and stop. If NONE match, proceed to next tier.

### Pattern 2: Parallel Dispatch

Multiple paths followed simultaneously when multiple transitions share the same priority.

```typescript
// Node A completes
Transitions (all at same priority):
  priority: 1, condition: { score >= 80 } → Node B
  priority: 1, condition: { hasErrors == false } → Node C
  priority: 1, condition: { reviewCount > 3 } → Node D

// If score=85, hasErrors=false, reviewCount=5
// → All conditions at priority 1 match
// → 3 tokens spawned (one to B, C, D each)
```

**Implementation:** Transitions at the same priority level are evaluated together. All matching transitions are followed.

**Key insight:** Same priority = parallel dispatch. Different priority = sequential tiers.

### Pattern 3: Replication (Fan-out)

Multiple tokens execute the same path.

```typescript
// Node A completes
Transition:
  id: 'trans_a_to_b',
  from_node_id: 'A',
  to_node_id: 'B',
  spawn_count: 5

// → 5 tokens spawned to Node B
// → All have fan_out_transition_id = 'trans_a_to_b'
// → branch_index: 0,1,2,3,4
// → branch_total: 5
```

**Use case:** Parallel LLM judges, multiple attempts, Monte Carlo sampling.

### Pattern 4: Mixed (Parallel + Replication)

Combine parallel dispatch with per-transition replication.

```typescript
// Node A completes
Transitions (same priority = parallel dispatch):
  id: 'trans_research', priority: 1, condition: { mode == 'research' }, spawn_count: 3 → Node B
  id: 'trans_validate', priority: 1, condition: { mode == 'validate' }, spawn_count: 5 → Node C

// If mode='research' and mode='validate' both true
// → 8 tokens total (3 to B, 5 to C)
// → 3 tokens have fan_out_transition_id = 'trans_research' (siblings with each other)
// → 5 tokens have fan_out_transition_id = 'trans_validate' (siblings with each other)
// → NOT siblings across transitions
```

**Use case:** Different strategies with different parallelism levels, evaluated in parallel.

**Important:** Each transition creates its own sibling group. The 3 tokens to B are siblings with each other, and the 5 tokens to C are siblings with each other, but they are NOT siblings across transitions.

### Pattern 5: Dynamic Iteration (foreach)

Spawn one token per collection item.

```typescript
Transition:
  from_node_id: 'A',
  to_node_id: 'B',
  foreach: {
    collection: 'input.judges',  // Array of 5 items
    item_var: 'judge'
  }

// → 5 tokens spawned to Node B
// → Each token can access judges[i] via input mapping
// → Each writes to isolated branch_output_tok_* table
```

**Use case:** Process array items in parallel (dynamic fan-out count).

## Token Lineage and State

Tokens track execution history and current execution state:

```typescript
Token {
  id: 'tok_abc123',
  workflow_run_id: string,
  node_id: string,
  path_id: 'root.A.0.B.2',  // Root → Node A branch 0 → Node B branch 2
  parent_token_id: 'tok_parent',
  fan_out_transition_id: 'trans_b_spawn',  // Transition that spawned this token
  branch_index: 2,          // Position in sibling group
  branch_total: 5,          // Total siblings from this transition

  // State machine
  state: TokenState,
  state_data?: StateSpecificData,
  state_updated_at: timestamp
}

enum TokenState {
  'pending',              // Created, not dispatched yet
  'dispatched',           // Sent to Executor
  'executing',            // Executor acknowledged, running task
  'waiting_for_siblings', // At fan-in, waiting for synchronization
  'completed',            // Successfully finished (terminal)
  'failed',               // Execution error (terminal)
  'timed_out',            // Exceeded timeout (terminal)
  'cancelled'             // Explicitly cancelled (terminal)
}

type StateSpecificData =
  | { state: 'waiting_for_siblings', arrived_at: timestamp, awaiting_count: number }
  | { state: 'timed_out', timeout_at: timestamp }
  | { state: 'cancelled', cancelled_by: token_id, reason?: string }
  | { state: 'failed', error: Error, retry_count: number }
```

**State Transitions:**

```
pending → dispatched → executing → completed
                           ↓
                         failed

pending → dispatched → executing → waiting_for_siblings → dispatched
                                              ↓
                                          completed

Any state → timed_out (via timeout mechanism)
Any non-terminal → cancelled (via explicit cancellation)
```

**State Semantics:**

- `pending`: Token created, waiting to be dispatched (may be in queue)
- `dispatched`: Sent to Executor, awaiting acknowledgment
- `executing`: Executor running the node's task
- `waiting_for_siblings`: Token arrived at fan-in, waiting for other siblings
- `completed`: Terminal state - task execution succeeded
- `failed`: Terminal state - task execution failed
- `timed_out`: Terminal state - exceeded timeout deadline
- `cancelled`: Terminal state - cancelled by user or early completion policy

**Path Format:** `root[.nodeId.branchIndex]*`

Examples:

- Initial token: `root`
- After Node A fans out (3x): `root.A.0`, `root.A.1`, `root.A.2`
- Token 0 reaches Node B, fans out (4x): `root.A.0.B.0`, `root.A.0.B.1`, `root.A.0.B.2`, `root.A.0.B.3`

## Fan-in (Synchronization)

Transitions can specify synchronization requirements for tokens arriving via that path.

```typescript
Transition {
  from_node_id: 'B',
  to_node_id: 'C',
  synchronization: {
    strategy: 'all',                    // Wait for all siblings
    sibling_group: 'trans_a',           // Which fan_out_transition_id to synchronize on
    timeout_ms: null,                   // No timeout
    on_timeout: 'fail',                 // Fail if timeout occurs
    merge: {
      source: '_branch.output',         // All fields from branch output
      target: 'state.votes',            // Where to write merged result
      strategy: 'append'                // How to combine
    }
  }
}
```

**Storage:** Each sibling writes to `branch_output_{tokenId}` table. At fan-in, all sibling tables are read, merged per strategy, and written to `context_state.votes`. See `branch-storage.md` for details.

**Sibling Identification:**

Tokens are siblings if they share a common `fan_out_transition_id` (the transition specified in `sibling_group`).

```sql
-- Find all siblings from transition 'trans_a'
SELECT * FROM tokens
WHERE workflow_run_id = ?
AND fan_out_transition_id = 'trans_a'
```

**Synchronization Implementation:**

When a token arrives at a node via a transition with synchronization:

1. Check if token belongs to the specified sibling group (`fan_out_transition_id` matches `sibling_group`)
2. If yes: query all siblings and check their states
3. Count siblings in terminal states (`completed`, `failed`, `timed_out`, `cancelled`)
4. Determine if synchronization condition is met based on `strategy` mode
5. If condition met: merge outputs and create new token in `pending` state
6. If not met: transition current token to `waiting_for_siblings` state
7. If token doesn't belong to sibling group: pass through as `dispatched`

**Synchronization Strategies:**

- `any`: First arrival proceeds immediately; remaining siblings continue independently (no cancellation, no coordination). This is the default when no synchronization is specified.
- `all`: Wait for all siblings from the specified transition; one merged token proceeds
- `{ m_of_n: number }`: Wait for M siblings (partial quorum); one merged token proceeds after M arrive; remaining siblings continue independently

> **Addendum: Strategy-Specific Condition Evaluation**
>
> Each strategy evaluates a different condition in step 4 above:
>
> - `any`: Always proceed (first arrival wins)
> - `all`: Proceed when `terminal_count >= branch_total` (all siblings finished, regardless of success/failure)
> - `{ m_of_n: M }`: Proceed when `completed_count >= M` (M siblings **succeeded** with usable outputs)
>
> The distinction matters: `all` needs to know everyone is _done_ before assessing results (failed branches may still inform downstream decisions). `m_of_n` needs M _usable outputs_ to merge—a failed branch doesn't contribute a vote.
>
> Merge operations only include outputs from **completed** siblings. Failed/cancelled/timed-out branches do not produce mergeable outputs.

**Example: Multiple fan-out groups converging**

```typescript
// Node A spawns via two transitions
Transition: id: 'trans_a1', A → B, spawn_count: 3
Transition: id: 'trans_a2', A → C, spawn_count: 5

// Node D receives from both paths with separate synchronization
Transition: B → D, synchronization: {
  sibling_group: 'trans_a1',
  strategy: 'all',
  merge: { source: '_branch.output', target: 'state.group_a', strategy: 'append' }
}

Transition: C → D, synchronization: {
  sibling_group: 'trans_a2',
  strategy: 'all',
  merge: { source: '_branch.output', target: 'state.group_b', strategy: 'append' }
}
```

**Error Handling:**

Failed nodes produce error objects in their branch output tables. These flow through merge strategies like any other output. Downstream nodes can inspect merged results (e.g., `state.votes`) and route based on success/failure states. This keeps error handling in the application layer rather than the workflow engine.

**Note:** Branch outputs are stored in separate SQL tables per token (see `branch-storage.md`), not as flat `_branch.output` key-value pairs.

## Routing Algorithm

```typescript
async function handleTaskResult(token, result) {
  // 1. Get completed node
  const node = getNode(token.node_id);

  // 2. Apply task output to workflow context via node's output_mapping
  applyOutputMapping(node, result);

  // 3. Get outgoing transitions grouped by priority
  const transitions = getTransitions(node.id);
  const grouped = groupBy(transitions, (t) => t.priority);
  const sortedPriorities = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  // 4. Evaluate by priority tier (stop at first non-empty tier)
  let transitionsToFollow = [];
  for (const priority of sortedPriorities) {
    const transitionsAtThisPriority = grouped[priority];
    const matches = transitionsAtThisPriority.filter((t) =>
      evaluateCondition(t.condition, context),
    );

    if (matches.length > 0) {
      // Found matches at this priority tier - follow all and stop
      transitionsToFollow = matches;
      break;
    }
    // No matches at this tier, try next priority
  }

  if (transitionsToFollow.length === 0) {
    throw new Error('No matching transitions');
  }

  // 5. Spawn tokens

  for (const transition of transitionsToFollow) {
    const spawnCount = determineSpawnCount(transition, context);
    const fanOutTransitionId = spawnCount > 1 ? transition.id : null;

    for (let i = 0; i < spawnCount; i++) {
      const pathId = buildPathId(token.path_id, node.id, i, spawnCount);

      const newToken = createToken({
        workflow_run_id: token.workflow_run_id,
        node_id: transition.to_node_id,
        parent_token_id: token.id,
        path_id: pathId,
        fan_out_transition_id: fanOutTransitionId,
        branch_index: i,
        branch_total: spawnCount,
        state: 'pending',
        state_updated_at: now(),
      });

      // Check if this transition requires synchronization
      if (transition.synchronization) {
        const siblingGroupId = transition.synchronization.sibling_group;

        // Verify this token belongs to the specified sibling group
        if (newToken.fan_out_transition_id === siblingGroupId) {
          // Token is part of this sibling group - apply synchronization
          if (transition.synchronization.strategy !== 'any') {
            // Check if synchronization condition is met
            const siblings = getSiblings(newToken.workflow_run_id, siblingGroupId);
            const terminalStates = ['completed', 'failed', 'timed_out', 'cancelled'];
            const finishedCount =
              siblings.filter((s) => terminalStates.includes(s.state)).length + 1; // +1 for current token

            if (
              shouldProceedWithFanIn(finishedCount, spawnCount, transition.synchronization.strategy)
            ) {
              // Condition met: merge and dispatch
              mergeAndDispatch(siblings, newToken, transition);
            } else {
              // Condition not met: wait
              newToken.state = 'waiting_for_siblings';
              newToken.state_data = {
                state: 'waiting_for_siblings',
                arrived_at: now(),
                awaiting_count: spawnCount - finishedCount,
              };
              saveToken(newToken);
            }
          } else {
            // 'any' mode: proceed immediately
            newToken.state = 'dispatched';
            dispatchToken(newToken);
          }
        } else {
          // Token is not part of this sibling group - pass through
          newToken.state = 'dispatched';
          dispatchToken(newToken);
        }
      } else {
        // No synchronization: dispatch immediately
        newToken.state = 'dispatched';
        dispatchToken(newToken);
      }
    }
  }

  // 7. Check workflow completion
  if (getActiveTokenCount() === 0) {
    completeWorkflow();
  }
}

function determineSpawnCount(transition, context) {
  if (transition.foreach) {
    // Dynamic: count items in collection
    const collection = getFromContext(context, transition.foreach.collection);
    return Array.isArray(collection) ? collection.length : 1;
  }
  // Static: use spawn_count or default to 1
  return transition.spawn_count ?? 1;
}

function buildPathId(parentPath, nodeId, branchIndex, branchTotal) {
  if (branchTotal > 1) {
    return `${parentPath}.${nodeId}.${branchIndex}`;
  }
  // No fan-out: don't add to path
  return parentPath;
}
```

## Condition Evaluation

Structured conditions support:

- **Comparison**: `{ type: 'comparison', left: {field: 'state.score'}, operator: '>=', right: {literal: 80} }`
- **Exists**: `{ type: 'exists', field: {field: 'state.approval'} }`
- **In Set**: `{ type: 'in_set', field: {field: 'state.status'}, values: ['approved', 'pending'] }`
- **Array Length**: `{ type: 'array_length', field: {field: 'state.votes'}, operator: '>=', value: 5 }`
- **Boolean Logic**: `{ type: 'and', conditions: [...] }`

CEL expressions available as fallback for complex logic not covered by structured conditions.

**Purity requirement:** All conditions must be pure functions—deterministic with no side effects. This ensures consistent evaluation regardless of execution order.

## Priority Tier Semantics

The priority field on transitions controls both evaluation order and parallelism:

**Same priority = parallel dispatch:**

```typescript
// All transitions at priority 1 evaluated together
priority: 1, condition: {a} → B
priority: 1, condition: {b} → C
priority: 1, condition: {c} → D
// If all match: 3 tokens spawned (to B, C, and D)
```

**Different priority = sequential tiers:**

```typescript
// Evaluate priority 1 first
priority: 1, condition: {approved} → B
// Only if priority 1 has NO matches, evaluate priority 2
priority: 2, condition: {rejected} → C
// Only if priority 2 has NO matches, evaluate priority 3
priority: 3 → D  // default fallback
```

**Key insight:** If you want both priority 1 AND priority 2 transitions to fire, make them both priority 1. Priority tiers are for fallback logic, not for ordering parallel paths.

## Edge Cases

### No matching transitions at any priority tier

Workflow error. Best practice: include an unconditional transition at lowest priority as a fallback.

```typescript
priority: 1, condition: {normal_path} → B
priority: 999, (no condition) → ErrorHandler  // Catch-all
```

### Synchronization without siblings

If `joins_transition` references a transition that didn't fan out (spawn_count=1), synchronization degenerates to simple pass-through.

### Nested fan-out lineage

Tokens preserve full ancestry in `path_id`. Synchronization at any level references the specific `joins_transition` that created the sibling group.

### Multiple transitions converging

Each transition creates its own sibling group via `fan_out_transition_id`. Synchronization is per-transition, not per-node, allowing fine-grained control over which tokens must synchronize.

## Future Enhancements

- **Timeouts**: Token-level, synchronization-level, and workflow-level timeout policies
  - Leverage token state machine: background job transitions `executing` or `waiting_for_siblings` → `timed_out`
  - Synchronization timeout: `timeout: '5m', on_timeout: 'proceed_with_available' | 'fail'`
- **Early completion (race patterns)**: `wait_for: { first_n: 3 }, on_completion: 'cancel_remaining'`
  - Transition remaining siblings from `executing` → `cancelled`
  - Requires cancellation protocol with Executor
- **Explicit cancellation**: Task to cancel sibling groups on demand
  - Query siblings by `fan_out_transition_id`, transition to `cancelled` state
- **Retry on failure**: Leverage `failed` state with retry_count to automatically retry failed tokens
- **Conditional spawn_count**: `spawn_count: { from_context: 'input.num_judges' }`
- **Streaming merge**: Process results as they arrive (trigger on each sibling reaching terminal state)
