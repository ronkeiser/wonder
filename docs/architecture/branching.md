# Branching and Parallelism

## Overview

Wonder's branching model is based on **transition-centric control flow**, inspired by Petri nets and BPMN workflow patterns. All branching logic—conditions, parallelism, and replication—is specified on transitions, not nodes.

## Core Principles

1. **Nodes execute actions** - no branching logic
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
    wait_for: 'any' | 'all' | { m_of_n: number },
    joins_transition: string, // Which transition's fan-out to synchronize on
    merge?: {
      source: string,         // Path in _branch.output
      target: string,         // Where to write merged result
      strategy: 'append' | 'merge' | 'keyed' | 'last_wins'
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
// → Each has context._branch.item = judges[i]
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
  'dispatched',           // Sent to executor
  'executing',            // Executor acknowledged, running action
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
- `dispatched`: Sent to executor service, awaiting acknowledgment
- `executing`: Executor running the node's action
- `waiting_for_siblings`: Token arrived at fan-in, waiting for other siblings
- `completed`: Terminal state - node execution succeeded
- `failed`: Terminal state - node execution failed
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
    wait_for: 'all',              // Wait for all siblings
    joins_transition: 'trans_a',  // Which transition's fan-out to join
    merge: {
      source: '*',                // Path in _branch.output
      target: 'state.votes',      // Where to write merged result
      strategy: 'append'          // How to combine
    }
  }
}
```

**Sibling Identification:**

Tokens are siblings if they share a common `fan_out_transition_id` (the transition specified in `joins_transition`).

```sql
-- Find all siblings from transition 'trans_a'
SELECT * FROM tokens
WHERE workflow_run_id = ?
AND fan_out_transition_id = 'trans_a'
```

**Synchronization Implementation:**

When a token arrives at a node via a transition with synchronization:

1. Check if token belongs to the specified sibling group (`fan_out_transition_id` matches `joins_transition`)
2. If yes: query all siblings and check their states
3. Count siblings in terminal states (`completed`, `failed`, `timed_out`, `cancelled`)
4. Determine if synchronization condition is met based on `wait_for` mode
5. If condition met: merge outputs and create new token in `pending` state
6. If not met: transition current token to `waiting_for_siblings` state
7. If token doesn't belong to sibling group: pass through as `dispatched`

**Synchronization Modes:**

- `any`: First arrival proceeds immediately; remaining siblings continue independently (no cancellation, no coordination). This is the default when no synchronization is specified.
- `all`: Wait for all siblings from the specified transition; one merged token proceeds
- `m_of_n`: Wait for M siblings (partial quorum); one merged token proceeds after M arrive; remaining siblings continue independently

**Example: Multiple fan-out groups converging**

```typescript
// Node A spawns via two transitions
Transition: id: 'trans_a1', A → B, spawn_count: 3
Transition: id: 'trans_a2', A → C, spawn_count: 5

// Node D receives from both paths with separate synchronization
Transition: B → D, synchronization: {
  joins_transition: 'trans_a1',
  wait_for: 'all',
  merge: { target: 'state.group_a', strategy: 'append' }
}

Transition: C → D, synchronization: {
  joins_transition: 'trans_a2',
  wait_for: 'all',
  merge: { target: 'state.group_b', strategy: 'append' }
}
```

**Error Handling:**

Failed nodes produce error objects in their `_branch.output`. These flow through merge strategies like any other output. Downstream nodes can inspect merged results (e.g., `state.group_a`) and route based on success/failure states. This keeps error handling in the application layer rather than the workflow engine.

## Routing Algorithm

```typescript
async function handleTaskResult(token, result) {
  // 1. Get completed node
  const node = getNode(token.node_id);

  // 2. Apply output to context
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
        const joinsTransitionId = transition.synchronization.joins_transition;

        // Verify this token belongs to the specified sibling group
        if (newToken.fan_out_transition_id === joinsTransitionId) {
          // Token is part of this sibling group - apply synchronization
          if (transition.synchronization.wait_for !== 'any') {
            // Check if synchronization condition is met
            const siblings = getSiblings(newToken.workflow_run_id, joinsTransitionId);
            const terminalStates = ['completed', 'failed', 'timed_out', 'cancelled'];
            const finishedCount =
              siblings.filter((s) => terminalStates.includes(s.state)).length + 1; // +1 for current token

            if (
              shouldProceedWithFanIn(finishedCount, spawnCount, transition.synchronization.wait_for)
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
  - Requires cancellation protocol with executor service
- **Explicit cancellation**: Action type to cancel sibling groups on demand
  - Query siblings by `fan_out_transition_id`, transition to `cancelled` state
- **Retry on failure**: Leverage `failed` state with retry_count to automatically retry failed tokens
- **Conditional spawn_count**: `spawn_count: { from_context: 'input.num_judges' }`
- **Streaming merge**: Process results as they arrive (trigger on each sibling reaching terminal state)

## Open Questions & Concerns

### Resource Limits

- **Token explosion**: No documented limits on token count. Pattern: 100 judges × 50 candidates × 5 nested layers = tens of thousands of tokens in flight
- Need: Max tokens per workflow run, max spawn_count per transition, queuing/backpressure strategy
- DO SQLite storage capacity and coordination overhead at scale

### Timeout + Synchronization Interaction

- **Critical gap**: What happens when `wait_for: 'all'` encounters a timed-out sibling?
- Does fan-in block forever, or should it have `on_timeout: 'proceed_with_available' | 'fail'` policy?
- Currently in "Future Enhancements" but needed for production (stuck workflow detection)

### Partial Failure Handling

- **Error propagation**: Errors flow through merge as `_branch.output`, mixing with successful results
- If 50 of 100 judges fail, downstream gets mixed array of results + errors
- Need: `min_success_count` or `success_threshold` on synchronization config
- Should fan-in fail if too many branches fail? What's the policy?

### Early Completion (Race Patterns)

- **Currently missing**: `wait_for: 'any'` exists but doesn't cancel remaining siblings
- Use cases: "First 3 judges to agree", "First passing solution from 10 attempts"
- Listed as future enhancement but likely needed for AI workflow efficiency (cost + latency)
- Requires cancellation protocol with executor service

### Sub-Workflow Integration

- **Documentation gap**: How do `workflow_call` tokens interact with this branching model?
- Does parent token enter `waiting_for_siblings` state while sub-workflow runs?
- How does sub-workflow completion flow back through transitions?
- Nested composition is core requirement (5-6 layers) but not shown here

### Human Input Gate Integration

- **Documentation gap**: How do human input nodes use the token state machine?
- Likely needs `waiting_for_input` state, but interaction with synchronization unclear
- What happens if 100 tokens arrive at gate simultaneously? Queue? Batch UI?

### Mixed Parallelism Synchronization

- **Pattern 4 complexity**: Multiple transitions with different spawn counts create separate sibling groups
- Example: Research (10 tokens) + Validation (20 tokens) both converge downstream
- How to express "wait for all 30 total"? Requires two separate fan-in transitions with own configs
- Works but increases graph complexity—is there a simpler pattern?

### Synchronization Pass-Through Behavior

- **Potential confusion**: Token with `fan_out_transition_id='A'` hits fan-in for `joins_transition='B'`
- Doc says "pass through" but this could silently skip synchronization when intended
- Should system warn/error on mismatched synchronization attempts?
- Validation at graph authoring time vs runtime?
