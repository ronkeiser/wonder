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
  fromNodeId: string,
  toNodeId: string,
  priority: number,           // Lower = higher priority (1 = first)
  condition?: Condition,      // Structured or CEL expression
  spawnCount?: number,        // How many tokens for this path (default: 1)
  siblingGroup?: string,      // Named group identifier for fan-out tokens
  foreach?: ForeachConfig,    // Dynamic iteration over collection
  synchronization?: {         // Fan-in behavior for tokens arriving via this transition
    strategy: 'any' | 'all' | { mOfN: number },
    siblingGroup: string,     // Which sibling group to synchronize on
    timeoutMs?: number,       // Max wait time for siblings (undefined = no timeout)
    onTimeout?: 'proceed_with_available' | 'fail',  // Default: 'fail'
    merge?: MergeConfig
  },
  loopConfig?: LoopConfig     // For back-edges with iteration limits
}

MergeConfig {
  target: string,             // Where to write merged result (e.g., 'output.votes')
  strategy: 'append' | 'collect' | 'merge_object' | 'keyed_by_branch' | 'last_wins'
}

ForeachConfig {
  collection: string,         // Path to array in context (e.g., 'input.items')
  itemVar: string             // Variable name for current item
}

LoopConfig {
  maxIterations: number       // Maximum loop iterations before stopping
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
  fromNodeId: 'A',
  toNodeId: 'B',
  siblingGroup: 'judges',
  spawnCount: 5

// → 5 tokens spawned to Node B
// → All have siblingGroup = 'judges'
// → branchIndex: 0,1,2,3,4
// → branchTotal: 5
```

**Use case:** Parallel LLM judges, multiple attempts, Monte Carlo sampling.

### Pattern 4: Mixed (Parallel + Replication)

Combine parallel dispatch with per-transition replication.

```typescript
// Node A completes
Transitions (same priority = parallel dispatch):
  id: 'trans_research', priority: 1, condition: { mode == 'research' }, siblingGroup: 'research', spawnCount: 3 → Node B
  id: 'trans_validate', priority: 1, condition: { mode == 'validate' }, siblingGroup: 'validate', spawnCount: 5 → Node C

// If mode='research' and mode='validate' both true
// → 8 tokens total (3 to B, 5 to C)
// → 3 tokens have siblingGroup = 'research' (siblings with each other)
// → 5 tokens have siblingGroup = 'validate' (siblings with each other)
// → NOT siblings across groups
```

**Use case:** Different strategies with different parallelism levels, evaluated in parallel.

**Important:** Each sibling group is independent. The 3 tokens to B are siblings with each other, and the 5 tokens to C are siblings with each other, but they are NOT siblings across groups.

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
  id: string,               // ULID
  workflowRunId: string,
  nodeId: string,
  pathId: string,           // 'root.A.0.B.2' - hierarchical execution path
  parentTokenId: string | null,
  siblingGroup: string | null,  // Named group identifier (from transition.siblingGroup)
  branchIndex: number,      // Position in sibling group (0-indexed)
  branchTotal: number,      // Total siblings in group
  iterationCounts: Record<string, number> | null,  // Loop iteration tracking

  // State
  status: TokenStatus,
  arrivedAt: Date | null,   // When token arrived at fan-in (for timeout calculation)
  createdAt: Date,
  updatedAt: Date
}

type TokenStatus =
  | 'pending'               // Created, not dispatched yet
  | 'dispatched'            // Sent to Executor
  | 'executing'             // Executor acknowledged, running task
  | 'waiting_for_siblings'  // At fan-in, waiting for synchronization
  | 'waiting_for_subworkflow' // Waiting for child workflow to complete
  | 'completed'             // Successfully finished (terminal)
  | 'failed'                // Execution error (terminal)
  | 'timed_out'             // Exceeded timeout (terminal)
  | 'cancelled'             // Explicitly cancelled (terminal)
```

**State Transitions:**

```
pending → dispatched → executing → completed
                           ↓
                         failed

pending → dispatched → executing → waiting_for_siblings → completed (fan-in activated)
                                              ↓
                                          timed_out (if timeout configured)

pending → dispatched → waiting_for_subworkflow → completed (subworkflow done)
                                    ↓
                                  failed (subworkflow failed)

Any non-terminal → cancelled (via explicit cancellation or fan-in race)
```

**Status Semantics:**

- `pending`: Token created, not yet dispatched
- `dispatched`: Sent to Executor, awaiting execution
- `executing`: Executor running the node's task
- `waiting_for_siblings`: Token arrived at fan-in, waiting for sync condition
- `waiting_for_subworkflow`: Token dispatched subworkflow, waiting for completion
- `completed`: Terminal state - task/subworkflow succeeded
- `failed`: Terminal state - execution error
- `timed_out`: Terminal state - exceeded timeout deadline
- `cancelled`: Terminal state - cancelled by fan-in race or explicit cancellation

**Path Format:** `root[.nodeId.branchIndex]*`

Examples:

- Initial token: `root`
- After Node A fans out (3x): `root.A.0`, `root.A.1`, `root.A.2`
- Token 0 reaches Node B, fans out (4x): `root.A.0.B.0`, `root.A.0.B.1`, `root.A.0.B.2`, `root.A.0.B.3`

## Fan-in (Synchronization)

Transitions can specify synchronization requirements for tokens arriving via that path.

```typescript
Transition {
  fromNodeId: 'B',
  toNodeId: 'C',
  synchronization: {
    strategy: 'all',                    // Wait for all siblings
    siblingGroup: 'judges',             // Which sibling group to synchronize on
    timeoutMs: 30000,                   // 30 second timeout (optional)
    onTimeout: 'fail',                  // Fail if timeout occurs
    merge: {
      target: 'output.votes',           // Where to write merged result
      strategy: 'append'                // How to combine
    }
  }
}
```

**Storage:** Each sibling writes to `branch_output_{tokenId}` table. At fan-in, all sibling tables are read, merged per strategy, and written to context. See `branch-storage.md` for details.

**Sibling Identification:**

Tokens are siblings if they share a common `siblingGroup` value (from the fan-out transition's `siblingGroup` field).

```sql
-- Find all siblings in group 'judges'
SELECT * FROM tokens
WHERE workflow_run_id = ?
AND sibling_group = 'judges'
```

**Synchronization Implementation:**

When routing creates a token at a node via a transition with synchronization:

1. Get sibling counts from TokenManager (`getSiblingCounts`)
2. Call `decideSynchronization()` planning function with token, transition, and counts
3. Based on strategy:
   - `'any'`: First arrival wins - activate immediately
   - `'all'`: Check if `terminal_count >= branchTotal`
   - `{ mOfN: M }`: Check if `completed_count >= M`
4. If condition met: `ACTIVATE_FAN_IN` decision
   - Race-safe via `TRY_ACTIVATE_FAN_IN` (SQL unique constraint)
   - Merge branch outputs
   - Create continuation token
   - Mark waiting/in-flight siblings as completed/cancelled
5. If not met: `MARK_WAITING` decision - token enters `waiting_for_siblings` state

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
// Node A spawns via two transitions with different sibling groups
Transition: id: 'trans_a1', A → B, siblingGroup: 'group_a', spawnCount: 3
Transition: id: 'trans_a2', A → C, siblingGroup: 'group_b', spawnCount: 5

// Node D receives from both paths with separate synchronization
Transition: B → D, synchronization: {
  siblingGroup: 'group_a',
  strategy: 'all',
  merge: { target: 'output.group_a_results', strategy: 'append' }
}

Transition: C → D, synchronization: {
  siblingGroup: 'group_b',
  strategy: 'all',
  merge: { target: 'output.group_b_results', strategy: 'append' }
}
```

**Error Handling:**

Failed nodes produce error objects in their branch output tables. These flow through merge strategies like any other output. Downstream nodes can inspect merged results (e.g., `state.votes`) and route based on success/failure states. This keeps error handling in the application layer rather than the workflow engine.

**Note:** Branch outputs are stored in separate SQL tables per token (see `branch-storage.md`), not as flat `_branch.output` key-value pairs.

## Routing Algorithm

The coordinator uses a planning/dispatch separation. Planning functions are pure (return Decision[]), dispatch executes them.

```typescript
// dispatch/task.ts - processTaskResult()
async function processTaskResult(ctx, tokenId, result) {
  // 1. Mark token completed
  await applyDecisions([{ type: 'COMPLETE_TOKEN', tokenId }], ctx);

  // 2. Handle output by flow type
  const token = ctx.tokens.get(tokenId);
  const node = ctx.defs.getNode(token.nodeId);

  if (token.siblingGroup) {
    // Fan-out: write to branch table
    await handleBranchOutput(ctx, token, node, result.outputData);
  } else {
    // Linear: apply outputMapping to context
    await applyDecisions([{
      type: 'APPLY_OUTPUT_MAPPING',
      outputMapping: node.outputMapping,
      outputData: result.outputData
    }], ctx);
  }

  // 3. Plan routing (pure function)
  const transitions = ctx.defs.getTransitionsFrom(token.nodeId);
  const context = ctx.context.getSnapshot();
  const routingResult = decideRouting({ completedToken: token, transitions, context });

  // 4. Apply routing decisions (creates tokens)
  const applyResult = await applyDecisions(routingResult.decisions, ctx);

  // 5. Process synchronization for created tokens
  const syncTransitions = getTransitionsWithSynchronization(transitions, context);
  const continuationTokenIds = await processSynchronization(
    ctx,
    applyResult.tokensCreated,
    syncTransitions
  );

  // 6. Dispatch tokens
  const dispatchedTokens = applyResult.tokensCreated.filter(
    id => ctx.tokens.get(id).status === 'dispatched'
  );
  await Promise.all(dispatchedTokens.map(id => dispatchToken(ctx, id)));
  await Promise.all(continuationTokenIds.map(id => dispatchToken(ctx, id)));

  // 7. Check completion
  if (ctx.tokens.getActiveCount(ctx.workflowRunId) === 0) {
    await finalizeWorkflow(ctx);
  }
}

// planning/routing.ts - decideRouting()
function decideRouting({ completedToken, transitions, context }): PlanningResult {
  // Group by priority, evaluate tiers in order
  const grouped = groupBy(transitions, t => t.priority);
  const sortedPriorities = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  let transitionsToFollow = [];
  for (const priority of sortedPriorities) {
    const matches = grouped[priority].filter(t => evaluateCondition(t.condition, context));
    if (matches.length > 0) {
      transitionsToFollow = matches;
      break;  // First tier with matches wins
    }
  }

  // Generate CREATE_TOKEN decisions
  const decisions = [];
  for (const transition of transitionsToFollow) {
    const spawnCount = determineSpawnCount(transition, context);
    for (let i = 0; i < spawnCount; i++) {
      decisions.push({
        type: 'CREATE_TOKEN',
        params: {
          workflowRunId: completedToken.workflowRunId,
          nodeId: transition.toNodeId,
          parentTokenId: completedToken.id,
          pathId: buildPathId(completedToken.pathId, completedToken.nodeId, i, spawnCount),
          siblingGroup: transition.siblingGroup ?? null,
          branchIndex: i,
          branchTotal: spawnCount,
          iterationCounts: completedToken.iterationCounts
        }
      });
    }
  }

  return { decisions, events: [] };
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

If no transitions match, the token has no next step. If no other active tokens remain, the workflow completes. Best practice: include an unconditional transition at lowest priority as a fallback.

```typescript
priority: 1, condition: {normal_path} → B
priority: 999, (no condition) → ErrorHandler  // Catch-all
```

### Synchronization without siblings

If `siblingGroup` references a group with only one token (spawnCount=1), synchronization condition is immediately met - the single token proceeds.

### Nested fan-out lineage

Tokens preserve full ancestry in `pathId`. Synchronization at any level references the named `siblingGroup` that created the sibling group.

### Multiple sibling groups converging

Each fan-out transition declares its own `siblingGroup` name. Synchronization is per-group, not per-node, allowing fine-grained control over which tokens must synchronize.

### Fan-in race conditions

When multiple siblings complete simultaneously, the `TRY_ACTIVATE_FAN_IN` decision uses a SQL unique constraint to ensure only one activates the fan-in. Losers have their arrival tokens marked completed.

## Implemented Features

- **Synchronization timeouts**: `timeoutMs` and `onTimeout: 'proceed_with_available' | 'fail'` on transitions
- **Early completion (race patterns)**: `strategy: 'any'` proceeds on first arrival; `{ mOfN: M }` for quorum
- **Sibling cancellation**: When fan-in activates, in-flight siblings are cancelled automatically
- **Subworkflow timeouts**: `timeoutMs` on MARK_WAITING_FOR_SUBWORKFLOW decision
- **Loop iteration limits**: `loopConfig.maxIterations` prevents infinite loops

## Future Enhancements

- **Conditional spawnCount**: `spawnCount: { fromContext: 'input.num_judges' }`
- **Streaming merge**: Process results as they arrive (trigger on each sibling reaching terminal state)
- **Task-level retry**: Leverage `failed` status with retry count to automatically retry failed tokens
