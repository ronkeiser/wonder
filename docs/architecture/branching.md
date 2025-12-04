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
  from_node_id: string,
  to_node_id: string,
  priority: number,           // Lower = higher priority (1 = first)
  condition?: Condition,      // Structured or CEL expression
  spawn_count?: number,       // How many tokens for this path (default: 1)
  foreach?: {                 // Dynamic iteration over collection
    collection: string,
    item_var: string
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
  from_node_id: 'A',
  to_node_id: 'B',
  spawn_count: 5

// → 5 tokens spawned to Node B
// → All have fan_out_node_id = 'A'
// → branch_index: 0,1,2,3,4
// → branch_total: 5
```

**Use case:** Parallel LLM judges, multiple attempts, Monte Carlo sampling.

### Pattern 4: Mixed (Parallel + Replication)

Combine parallel dispatch with per-transition replication.

```typescript
// Node A completes
Transitions (same priority = parallel dispatch):
  priority: 1, condition: { mode == 'research' }, spawn_count: 3 → Node B
  priority: 1, condition: { mode == 'validate' }, spawn_count: 5 → Node C

// If mode='research' and mode='validate' both true
// → 8 tokens total (3 to B, 5 to C)
// → All have fan_out_node_id = 'A'
```

**Use case:** Different strategies with different parallelism levels, evaluated in parallel.

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

## Token Lineage

Tokens track execution history via hierarchical `path_id`:

```typescript
Token {
  id: 'tok_abc123',
  path_id: 'root.A.0.B.2',  // Root → Node A branch 0 → Node B branch 2
  parent_token_id: 'tok_parent',
  fan_out_node_id: 'B',     // Last fan-out node that spawned this
  branch_index: 2,          // Position in sibling group
  branch_total: 5           // Total siblings
}
```

**Path Format:** `root[.nodeId.branchIndex]*`

Examples:

- Initial token: `root`
- After Node A fans out (3x): `root.A.0`, `root.A.1`, `root.A.2`
- Token 0 reaches Node B, fans out (4x): `root.A.0.B.0`, `root.A.0.B.1`, `root.A.0.B.2`, `root.A.0.B.3`

## Fan-in (Synchronization)

Nodes with `fan_in != 'any'` wait for sibling tokens to arrive.

```typescript
Node {
  fan_in: 'all',           // Wait for all siblings
  joins_node: 'A',         // Which node's fan-out to join
  merge: {
    source: '*',           // Path in _branch.output
    target: 'state.votes', // Where to write merged result
    strategy: 'append'     // How to combine
  }
}
```

**Sibling Identification:**

Tokens are siblings if they share a common `fan_out_node_id` (the node specified in `joins_node`).

```sql
-- Find all siblings from Node A's fan-out
SELECT * FROM tokens
WHERE workflow_run_id = ?
AND fan_out_node_id = 'A'
```

**Alternative (path-based):** Query by path prefix:

```sql
-- Find all direct children of Node A's fan-out
SELECT * FROM tokens
WHERE path_id LIKE 'root.A.%'
AND path_id NOT LIKE 'root.A.%.%'  -- Direct children only
```

**Fan-in Modes:**

- `any`: First arrival proceeds (no waiting)
- `all`: Wait for all siblings
- `m_of_n:3`: Wait for 3 siblings (partial quorum)

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
    const fanOutNodeId = spawnCount > 1 ? node.id : null;

    for (let i = 0; i < spawnCount; i++) {
      const pathId = buildPathId(token.path_id, node.id, i, spawnCount);

      const newToken = createToken({
        workflow_run_id: token.workflow_run_id,
        node_id: transition.to_node_id,
        parent_token_id: token.id,
        path_id: pathId,
        fan_out_node_id: fanOutNodeId,
        branch_index: i,
        branch_total: spawnCount,
      });

      // Check if target requires fan-in
      const targetNode = getNode(transition.to_node_id);
      if (shouldWaitAtFanIn(targetNode, newToken)) {
        handleFanIn(targetNode, newToken);
      } else {
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

### Fan-in without siblings

If `joins_node` references a node that didn't fan out (spawn_count=1), fan-in degenerates to simple pass-through.

### Nested fan-out lineage

Tokens preserve full ancestry in `path_id`. Fan-in at any level queries by the appropriate `joins_node`.

### Multiple fan-outs converging

Valid. All tokens from the same `fan_out_node_id` are siblings, regardless of intermediate paths.

## Future Enhancements

- **Conditional spawn_count**: `spawn_count: { from_context: 'input.num_judges' }`
- **Branch-specific timeout policies**
- **Streaming merge** (process results as they arrive)
- **Early completion handlers** (`on_early_complete: 'cancel'` to stop other branches)
