# Capability 1: Multi-Node Graph Execution

## Goal

Enable workflows to traverse through multiple nodes via transitions, moving from single-node execution to full graph traversal.

## Why This Matters

Without multi-node execution, workflows are limited to single actions. This is the foundational capability that unlocks everything else - conditional routing, loops, complex pipelines, and real-world use cases.

## Current State

✅ Single-node workflows execute successfully  
✅ DO coordination, task queue, and event streaming working  
✅ Transitions can be defined in workflow defs  
❌ Transitions are not evaluated after task completion  
❌ Tokens don't advance to next nodes
❌ No terminal node detection

## What We're Building

### 1. Transition Evaluation

After a task completes successfully, query and evaluate transitions:

```typescript
// In TaskResultProcessor.process()
const transitions = await getTransitionsFromNode(token.node_id);
const matchingTransition = findFirstMatch(transitions, context);
```

- Query transitions by `from_node_id`, ordered by `priority` ASC
- First matching transition wins
- For now: **unconditional transitions only** (defer condition evaluation)
- Require explicit default transition (no implicit fallback)

### 2. Token Advancement

Move token to the next node:

```typescript
await tokens.moveToNode(token.id, matchingTransition.to_node_id);
await tasks.enqueue(token, nextNode, context);
```

- Update token's `current_node_id`
- Emit `transition_taken` event
- Enqueue next task to continue execution

### 3. Terminal Detection

Recognize when workflow completes:

```typescript
if (hasZeroOutgoingTransitions(nextNode.id)) {
  lifecycle.complete();
} else {
  advanceToken(token, nextTransition);
}
```

- Node with zero outgoing transitions = terminal
- Last active token reaching terminal = workflow complete
- Support multiple terminal nodes (parallel completion paths)

## Architecture

### New Components

**`TransitionEvaluator`** (`coordination/transitions.ts`)

- `getTransitionsFromNode(workflowDefId, nodeId): Promise<Transition[]>`
- `findFirstMatch(transitions, context): Transition | null`
- Initially just returns first transition (no condition evaluation)

**Enhanced `TokenManager`** (`coordination/tokens.ts`)

- `moveToNode(tokenId, nextNodeId): void`
- Update token state in DO SQLite

**Enhanced `TaskResultProcessor`** (`coordination/results.ts`)

- Replace hardcoded completion with transition evaluation
- Add terminal node detection
- Orchestrate token advancement

### Modified Components

**`results.ts`** - Replace this:

```typescript
// Check for workflow completion (Stage 0: single node, so always complete)
this.lifecycle.complete();
```

With:

```typescript
// Evaluate transitions and advance or complete
const transitions = await this.transitions.getTransitionsFromNode(result.node_id);

if (transitions.length === 0) {
  // Terminal node - workflow complete
  this.lifecycle.complete();
} else {
  // Find next transition and advance
  const nextTransition = this.transitions.findFirstMatch(transitions, context);
  if (!nextTransition) {
    throw new Error('No matching transition found');
  }
  await this.advanceToken(token, nextTransition);
}
```

## Data Flow

```
Worker completes task
  ↓
DO receives WorkflowTaskResult
  ↓
Update context with output
  ↓
Query transitions from current node
  ↓
Is terminal node? (zero transitions)
  ↓ YES              ↓ NO
Complete workflow    Find first match
                     ↓
                     Move token to next node
                     ↓
                     Emit transition_taken event
                     ↓
                     Enqueue next task
```

## Events

New event type:

```typescript
{
  kind: 'transition_taken',
  payload: {
    token_id: string,
    from_node_id: string,
    to_node_id: string,
    transition_id: string
  }
}
```

## Test Scenario

**3-Node Linear Workflow:**

```
[Node A: Summarize]
  → transition (priority 1, unconditional)
[Node B: Critique]
  → transition (priority 1, unconditional)
[Node C: Respond]
  (terminal - no outgoing transitions)
```

**Test Steps:**

1. Create workflow def with 3 LLM nodes + 2 transitions
2. Start workflow with input text
3. Verify Node A executes → context updated
4. Verify transition_taken event emitted
5. Verify Node B executes → context updated
6. Verify transition_taken event emitted
7. Verify Node C executes → context updated
8. Verify workflow_completed event (terminal detection)
9. Assert all 3 outputs present in final context

**Expected Events:**

```
workflow_started
node_started (Node A)
node_completed (Node A)
transition_taken (A → B)
node_started (Node B)
node_completed (Node B)
transition_taken (B → C)
node_started (Node C)
node_completed (Node C)
workflow_completed
```

## Implementation Checklist

### Phase 1: Transition Querying (~50 LOC)

- [ ] Create `TransitionEvaluator` class
- [ ] Implement `getTransitionsFromNode()` using graph repository
- [ ] Implement `findFirstMatch()` (just return first for now)
- [ ] Unit test: query transitions, verify priority ordering

### Phase 2: Token Movement (~30 LOC)

- [ ] Add `moveToNode()` to `TokenManager`
- [ ] Update token's `current_node_id` and `updated_at` in SQLite
- [ ] Unit test: token state updates correctly

### Phase 3: Terminal Detection (~20 LOC)

- [ ] Add `isTerminalNode()` helper
- [ ] Check transition count = 0
- [ ] Unit test: detect terminal vs non-terminal nodes

### Phase 4: Integration (~100 LOC)

- [ ] Refactor `TaskResultProcessor.process()`
- [ ] Add transition evaluation logic
- [ ] Add token advancement logic
- [ ] Add terminal detection
- [ ] Emit `transition_taken` events
- [ ] Handle "no matching transition" error case

### Phase 5: E2E Test (~150 LOC)

- [ ] Create 3-node workflow test
- [ ] Verify complete execution flow
- [ ] Verify all events emitted
- [ ] Verify context accumulates outputs
- [ ] Verify terminal detection works

## Effort Estimate

**~200 LOC total**  
**2-3 days** (including testing)

## Success Criteria

✅ Multi-node workflows execute from start to terminal  
✅ Tokens advance through transitions  
✅ Terminal nodes trigger workflow completion  
✅ `transition_taken` events emitted  
✅ E2E test passes with 3+ node workflow  
✅ No regression in single-node workflows

## Future Extensions (Deferred)

- Condition evaluation (Capability 2)
- Multiple active tokens (Capability 3 - parallelism)
- Loops with iteration limits
- Dynamic transition selection
