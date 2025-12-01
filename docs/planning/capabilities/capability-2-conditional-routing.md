# Capability 2: Conditional Routing

## Goal

Enable workflows to make decisions based on context state, routing execution through different paths based on runtime data.

## Why This Matters

Real workflows need branching logic: approve/reject decisions, error handling, quality gates, retry vs. abort choices. Without conditionals, workflows are just linear sequences.

## Current State (After Capability 1)

✅ Multi-node execution with unconditional transitions  
✅ Tokens advance through graph  
✅ Terminal detection working  
❌ All transitions unconditional (first match always wins)  
❌ No context-based decision making

## What We're Building

### 1. Structured Condition Types

Support fundamental condition patterns:

**Comparison**

```typescript
{
  type: 'comparison',
  left: { type: 'field', path: 'state.score' },
  operator: '>=',
  right: { type: 'literal', value: 0.8 }
}
```

**Exists**

```typescript
{
  type: 'exists',
  field: { type: 'field', path: 'state.approval' },
  negated: false
}
```

**In Set**

```typescript
{
  type: 'in_set',
  field: { type: 'field', path: 'state.status' },
  values: [
    { type: 'literal', value: 'approved' },
    { type: 'literal', value: 'pending' }
  ]
}
```

**Boolean Logic**

```typescript
{
  type: 'and',
  conditions: [
    { type: 'comparison', ... },
    { type: 'exists', ... }
  ]
}
```

### 2. Field References

JSONPath-style context navigation:

- `$.input.name` → `context.input.name`
- `$.state.score` → `context.state.score`
- `$.output.summary` → `context.output.summary`
- Nested paths: `$.state.results.confidence`

### 3. Condition Evaluation

Enhance `TransitionEvaluator.findFirstMatch()`:

```typescript
findFirstMatch(transitions: Transition[], context: Context): Transition | null {
  for (const transition of transitions) {
    if (!transition.condition) {
      return transition; // Unconditional = always match
    }

    if (this.evaluateCondition(transition.condition, context)) {
      return transition;
    }
  }
  return null; // No match = workflow error
}
```

### 4. Priority Semantics

Transitions evaluated in priority order (1, 2, 3, ...):

- First matching condition wins
- Unconditional "default" transition typically has lowest priority
- Require explicit default to avoid "no transition" errors

## Architecture

### New Components

**`ConditionEvaluator`** (`coordination/conditions.ts`)

- `evaluate(condition: StructuredCondition, context: Context): boolean`
- `resolveField(fieldRef: FieldRef, context: Context): unknown`
- `compareValues(left, operator, right): boolean`

### Modified Components

**`TransitionEvaluator`** (`coordination/transitions.ts`)

- Inject `ConditionEvaluator`
- Update `findFirstMatch()` to evaluate conditions

**Workflow Definition**

- Transitions now include optional `condition` field
- UI/API validates condition structure against schema

## Data Flow

```
Token completes node
  ↓
Query transitions (ordered by priority)
  ↓
For each transition:
  ↓
  Has condition?
  ↓ NO              ↓ YES
  Match!            Evaluate condition
                    ↓
                    TRUE → Match!
                    FALSE → Next transition
  ↓
First match or error
```

## Test Scenarios

### Test 1: Approval Gate

```
[Node A: LLM Review]
  state.decision = "approved" | "rejected"

→ Transition 1 (priority 1):
    condition: state.decision == "approved"
    to: Node B (Continue)

→ Transition 2 (priority 2):
    condition: state.decision == "rejected"
    to: Node C (Reject Path)
```

**Verify:**

- Input with approval → Node B executes
- Input with rejection → Node C executes
- Both paths reach terminal correctly

### Test 2: Quality Threshold

```
[Node A: LLM Generate]
  state.quality_score = 0.0 - 1.0

→ Transition 1 (priority 1):
    condition: state.quality_score >= 0.8
    to: Node B (Accept)

→ Transition 2 (priority 2):
    condition: state.quality_score < 0.8
    to: Node A (Retry - loop)
    loop_config.max_iterations = 3
```

**Verify:**

- High quality → accept path
- Low quality → retry loop
- Loop limit enforced

### Test 3: Complex Boolean Logic

```
[Node A: Process]
  state.approved = boolean
  state.score = number

→ Transition 1 (priority 1):
    condition: AND(
      exists(state.approved),
      state.approved == true,
      state.score >= 0.7
    )
    to: Node B

→ Transition 2 (priority 2):
    condition: true (default)
    to: Node C
```

**Verify:**

- All conditions met → Node B
- Any condition fails → Node C (default)

## Implementation Checklist

### Phase 1: Field Resolution (~40 LOC)

- [ ] Create `ConditionEvaluator` class
- [ ] Implement `resolveField()` for JSONPath navigation
- [ ] Handle nested paths (e.g., `state.results.score`)
- [ ] Unit test: field resolution with various paths

### Phase 2: Comparison Evaluation (~60 LOC)

- [ ] Implement `compareValues()` for operators: `>`, `<`, `==`, `!=`, `>=`, `<=`
- [ ] Type coercion (numbers, strings, booleans)
- [ ] Unit test: all operators with different types

### Phase 3: Condition Types (~80 LOC)

- [ ] Implement `evaluateComparison()`
- [ ] Implement `evaluateExists()`
- [ ] Implement `evaluateInSet()`
- [ ] Implement `evaluateBoolean()` (AND/OR recursion)
- [ ] Unit test: each condition type

### Phase 4: Integration (~50 LOC)

- [ ] Update `TransitionEvaluator.findFirstMatch()`
- [ ] Inject `ConditionEvaluator`
- [ ] Handle missing condition (unconditional)
- [ ] Handle no matching transition (error)
- [ ] Unit test: priority ordering with conditions

### Phase 5: E2E Tests (~120 LOC)

- [ ] Approval gate test
- [ ] Quality threshold test
- [ ] Complex boolean logic test
- [ ] Verify event sequences
- [ ] Verify context state at each step

## Effort Estimate

**~250 LOC total**  
**3-4 days** (including testing)

## Success Criteria

✅ Comparison conditions evaluate correctly  
✅ Exists conditions work  
✅ In-set conditions work  
✅ Boolean AND/OR logic works  
✅ Field references resolve from context  
✅ Priority ordering respected  
✅ E2E tests pass for all scenarios  
✅ No regression in unconditional transitions

## Edge Cases to Handle

- Field doesn't exist → comparison returns false
- Type mismatch in comparison → coerce or error
- Empty condition list in AND/OR → AND=true, OR=false
- Null/undefined values in context
- No matching transition → workflow error (force explicit default)

## Future Extensions (Deferred)

- CEL expression fallback for complex conditions
- Array operations (length, contains, all, any)
- String operations (contains, matches regex)
- Math operations in comparisons
- Custom functions/helpers
