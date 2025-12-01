# Capability 3: Fan-out/Fan-in Parallelism

## Goal

Enable workflows to spawn multiple parallel execution paths (fan-out) and merge their results back together (fan-in), unlocking massive parallelism for consensus mechanisms and parallel research.

## Why This Matters

This is Wonder's core differentiator: executing 100 LLM judges simultaneously, parallel research across multiple sources, multi-agent consensus. Without parallelism, workflows are sequential pipelines.

## Current State (After Capability 2)

✅ Multi-node execution with conditional routing  
✅ Single token traversing graph  
✅ Context state management  
❌ Only one token active at a time  
❌ No parallel execution  
❌ No result merging

## What We're Building

### 1. Fan-out Token Spawning

Node with `fan_out: 'all'` creates multiple tokens:

```typescript
// In TaskResultProcessor after node completes
if (node.fan_out === 'all') {
  const branchCount = determineBranchCount(node, context);

  for (let i = 0; i < branchCount; i++) {
    const childToken = createChildToken(parentToken, {
      branch_index: i,
      branch_total: branchCount,
      fan_out_node_id: node.id,
    });

    context._branch = {
      id: childToken.id,
      index: i,
      total: branchCount,
      fan_out_node_id: node.id,
      output: {},
    };

    tokens.store(childToken);
    tasks.enqueue(childToken, nextNode, context);
  }
}
```

### 2. Branch Context Isolation

Each token gets isolated `_branch` context:

```typescript
Context {
  input: { ... },        // Shared (read-only)
  state: { ... },        // Shared (read-only during fan-out)
  output: undefined,     // Not set yet
  artifacts: { ... },    // Shared

  _branch: {            // Isolated per token
    id: "tok_123",
    index: 2,
    total: 5,
    fan_out_node_id: "judge_node",
    output: {           // Each branch writes here
      vote: "A",
      rationale: "..."
    }
  }
}
```

**Output Mapping During Fan-out:**

- Maps to `_branch.output` instead of `state`
- Each token accumulates results independently
- No shared state mutation

### 3. Fan-in Synchronization

Node with `fan_in: 'all'` waits for siblings:

```typescript
// In TaskResultProcessor after branch completes
if (isFanInNode(nextNode)) {
  tokens.updateStatus(token.id, 'waiting_at_fan_in');

  const siblings = tokens.getSiblings(token.fan_out_node_id);
  const allArrived = siblings.every(
    (t) => t.status === 'waiting_at_fan_in' || t.status === 'completed',
  );

  if (allArrived) {
    // All siblings ready - perform merge
    const mergedOutput = applyMergeStrategy(
      node.merge.strategy,
      siblings.map((t) => getBranchOutput(t.id)),
    );

    context.state[node.merge.target] = mergedOutput;

    // Clear branch context
    delete context._branch;

    // Continue with single token
    const continuationToken = createMergedToken(siblings);
    tokens.store(continuationToken);
    tasks.enqueue(continuationToken, nextNode, context);

    // Cancel/complete other siblings
    siblings.forEach((t) => {
      if (t.id !== continuationToken.id) {
        tokens.updateStatus(t.id, 'completed');
      }
    });
  }
}
```

### 4. Merge Strategies

**Append (Array)**

```typescript
// Input: [{vote: "A"}, {vote: "B"}, {vote: "A"}]
// Output: state.votes = [{vote: "A"}, {vote: "B"}, {vote: "A"}]
```

**Merge Object (Shallow)**

```typescript
// Input: [{a: 1}, {b: 2}, {c: 3}]
// Output: state.merged = {a: 1, b: 2, c: 3}
```

**Last Wins**

```typescript
// Input: [{result: "v1"}, {result: "v2"}, {result: "v3"}]
// Output: state.result = "v3"
```

**Keyed by Branch**

```typescript
// Input: [{vote: "A"}, {vote: "B"}, {vote: "A"}]
// Output: state.votes = {
//   "0": {vote: "A"},
//   "1": {vote: "B"},
//   "2": {vote: "A"}
// }
```

## Architecture

### New Components

**`FanOutManager`** (`coordination/fan-out.ts`)

- `spawnBranchTokens(parentToken, branchCount): Token[]`
- `determineBranchCount(node, context): number`
- `createBranchContext(index, total, fanOutNodeId): BranchContext`

**`FanInManager`** (`coordination/fan-in.ts`)

- `getSiblingTokens(fanOutNodeId, workflowRunId): Token[]`
- `allSiblingsArrived(siblings): boolean`
- `applyMergeStrategy(strategy, outputs): unknown`
- `createMergedToken(siblings): Token`

**Enhanced `TokenManager`**

- Query tokens by `fan_out_node_id` + `workflow_run_id`
- Track sibling relationships
- Support multiple active tokens

**Enhanced `ContextManager`**

- Handle `_branch` isolation
- Apply output mapping to correct destination
- Merge branch outputs back to state

### Modified Components

**`TaskResultProcessor`**

- Detect fan-out nodes after completion
- Spawn multiple tokens
- Detect fan-in nodes
- Coordinate synchronization
- Apply merge strategies

**`TaskDispatcher`**

- Support enqueuing multiple tasks simultaneously
- Pass branch context to workers

## Data Flow

### Fan-out

```
Node completes
  ↓
Is fan_out: 'all'?
  ↓ YES
Determine branch count (e.g., 5)
  ↓
For each branch (0-4):
  ↓
  Create child token with branch metadata
  Create branch context
  Enqueue task with branch context
  Emit token_spawned event
  ↓
5 parallel worker executions
```

### Fan-in

```
Branch token completes
  ↓
Next node is fan_in?
  ↓ YES
Set token status = 'waiting_at_fan_in'
  ↓
Query all sibling tokens
  ↓
All siblings arrived?
  ↓ NO              ↓ YES
Wait...            Collect branch outputs
                   Apply merge strategy
                   Write to state[target]
                   Clear _branch
                   Create merged token
                   Emit token_merged event
                   Continue execution
```

## Events

New event types:

```typescript
{
  kind: 'token_spawned',
  payload: {
    parent_token_id: string,
    child_token_id: string,
    branch_index: number,
    branch_total: number,
    fan_out_node_id: string
  }
}

{
  kind: 'token_merged',
  payload: {
    fan_out_node_id: string,
    sibling_token_ids: string[],
    merge_strategy: string,
    merged_token_id: string
  }
}
```

## Test Scenarios

### Test 1: Multi-Judge Consensus

```
[Node A: Define Question]
  state.question = "..."

→ [Node B: Judge Panel] (fan_out: 'all', count: 5)
    LLM judges evaluate
    Each writes: _branch.output = {vote: "A"|"B", rationale: "..."}

  → [Node C: Collect Votes] (fan_in: 'all')
      merge: {
        source: '*',
        target: 'state.votes',
        strategy: 'append'
      }
      Result: state.votes = [{vote, rationale}, ...]

    → [Node D: Tally Winner]
        Compute majority vote
        state.winner = "A" or "B"
```

**Verify:**

- 5 tokens spawned simultaneously
- 5 LLM calls execute in parallel
- Fan-in waits for all 5
- Votes merged into array
- Single token continues with merged data

### Test 2: Nested Fan-out

```
[Node A: Research Topics] (fan_out: 'all', count: 3)
  → [Node B: Deep Dive] (fan_out: 'all', count: 4)
      → [Node C: Merge Deep Dives] (fan_in: 'all')
    → [Node D: Merge Topics] (fan_in: 'all')
```

**Verify:**

- 3 outer tokens spawned
- Each spawns 4 inner tokens (12 total)
- Inner fan-in merges 4 → 1 (3 times)
- Outer fan-in merges 3 → 1
- Correct parent/child tracking

## Implementation Checklist

### Phase 1: Token Spawning (~80 LOC)

- [ ] Create `FanOutManager`
- [ ] Implement `spawnBranchTokens()`
- [ ] Implement `createBranchContext()`
- [ ] Update `TokenManager` to store multiple tokens
- [ ] Unit test: spawn N tokens with correct metadata

### Phase 2: Branch Context Isolation (~60 LOC)

- [ ] Update `ContextManager` to handle `_branch`
- [ ] Route output mapping to `_branch.output` during fan-out
- [ ] Unit test: branch isolation, no state mutation

### Phase 3: Sibling Tracking (~50 LOC)

- [ ] Add `getSiblings()` to `TokenManager`
- [ ] Query by `fan_out_node_id` + `workflow_run_id`
- [ ] Unit test: sibling identification

### Phase 4: Fan-in Synchronization (~100 LOC)

- [ ] Create `FanInManager`
- [ ] Implement `allSiblingsArrived()`
- [ ] Implement wait logic in `TaskResultProcessor`
- [ ] Track waiting tokens
- [ ] Unit test: synchronization with varying arrival orders

### Phase 5: Merge Strategies (~80 LOC)

- [ ] Implement `append` strategy
- [ ] Implement `merge_object` strategy
- [ ] Implement `last_wins` strategy
- [ ] Implement `keyed_by_branch` strategy
- [ ] Unit test: each strategy with sample data

### Phase 6: Integration (~130 LOC)

- [ ] Update `TaskResultProcessor` for fan-out detection
- [ ] Update `TaskResultProcessor` for fan-in detection
- [ ] Emit `token_spawned` events
- [ ] Emit `token_merged` events
- [ ] Handle edge cases (early completion, errors)

### Phase 7: E2E Tests (~200 LOC)

- [ ] Multi-judge consensus test (5 parallel LLM calls)
- [ ] Different merge strategies test
- [ ] Nested fan-out test (2 levels)
- [ ] Verify event sequences
- [ ] Verify context merging
- [ ] Performance: ensure true parallelism

## Effort Estimate

**~400 LOC total**  
**5-7 days** (including testing)

## Success Criteria

✅ Fan-out spawns N parallel tokens  
✅ Branch context isolation works  
✅ Fan-in synchronization waits for all siblings  
✅ All merge strategies work correctly  
✅ Events emitted properly  
✅ E2E test with 5+ parallel LLM calls passes  
✅ Nested fan-out works  
✅ No token leaks or orphaned tokens

## Edge Cases to Handle

- Fan-out with count = 1 (degenerate case)
- Fan-in with missing siblings (error)
- Branch failures during fan-out (partial results)
- Timeout during fan-in wait
- Race conditions in sibling arrival
- Memory/storage limits with 100+ tokens

## Future Extensions (Deferred)

- `fan_in: 'any'` (first arrival wins)
- `fan_in: { m_of_n: 3 }` (partial quorum)
- `on_early_complete: 'cancel'` (stop other branches)
- Dynamic branch count from context
- Branch-specific timeout policies
- Streaming merge (process results as they arrive)
