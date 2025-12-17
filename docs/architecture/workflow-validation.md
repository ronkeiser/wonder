# Workflow Validation

Comprehensive e2e test suite for coordinator and worker mechanics.

## Problem

Agents debugging complex workflow failures have no foundation of certainty. When a fan-out/synchronization bug occurs, they don't know which layer is broken—token creation? transition evaluation? context merging? They thrash because every component is a suspect.

Trace events were implemented to provide observability, but without a baseline of known-good behavior, agents get lost in the weeds exploring rabbit-holes.

## Solution

Build confidence from the ground up through exhaustive, incremental verification:

1. Start trivially simple—one node, one task, one step, one mock action
2. Add one concept per test—each test proves exactly one new primitive works
3. Use mock actions for determinism—no LLM variance, no network flakiness
4. Exhaustive assertions create ground truth—when test 47 fails, tests 1-46 pass, isolating the bug

## Two Assertion Strategies

Different aspects of the system require different testing approaches.

### Data Flow: Random Values + Relational Assertions

**Purpose:** Verify data actually propagates through the system.

**Pattern:**

- Mock action generates random value (no seed)
- Assert `point_A === point_B` without knowing what the value is

**Why:**

```typescript
// Node 1: Mock generates random {code: "xK7mP2"}
// Node 2: Should read code from state and echo it

// Relational assertion:
const node1Output = trace.context.setFieldAt('state.code')?.payload.value;
const finalOutput = result.output.code;
expect(finalOutput).toBe(node1Output); // Proves data flowed
```

**Bugs caught:**

- Hardcoded values (won't match random)
- Wrong path resolution (reads wrong field)
- Stale data (old value won't match current)

**Bugs missed with deterministic approach:**

```typescript
// If mock always generates "abc123" with seed 42:
expect(finalOutput.code).toBe('abc123'); // Passes even if Node 2 hardcodes "abc123"
```

### Coordinator Mechanics: Deterministic Seeds + Structural Snapshots

**Purpose:** Verify the coordinator makes correct decisions in correct order.

**Pattern:**

- Mock action with fixed seed for reproducibility
- Snapshot event types, sequences, paths—ignore payload values
- Or explicit assertions on decision types and token state transitions

**Why:**

- Event sequence matters: `pending → dispatched → executing → completed`
- Decision types matter: `CREATE_TOKEN`, `MARK_FOR_DISPATCH`, `ACTIVATE_FAN_IN`
- Payload values are irrelevant to coordinator correctness

**Structural snapshot example:**

```typescript
expect(trace.tokens.statusTransitions(tokenId)).toEqual([
  'pending',
  'dispatched',
  'executing',
  'completed',
]);
```

## Time Jitter for Synchronization Tests

Mock actions support configurable delay: `{ min_ms: 50, max_ms: 200 }`.

**Purpose:** Force the system to handle out-of-order completions.

**Without jitter:**

- Tokens created in order [A, B, C] likely complete in order [A, B, C]
- Synchronization logic that assumes arrival order = creation order passes
- Bug ships to production where network latency reorders completions

**With jitter:**

- Token A takes 200ms, B takes 50ms, C takes 150ms
- Arrival order: [B, C, A]
- Forces synchronization to actually track siblings, not assume ordering

**Bugs caught:**

- Off-by-one in sibling counting
- Race conditions in `tryActivate` (two siblings complete near-simultaneously)
- Branch output ordering assumptions
- Timeout edge cases (arrival 1ms before vs after timeout)

**Rule:** All synchronization tests must use jitter. If the test becomes "flaky," that's a real bug—the system should produce deterministic outcomes regardless of timing.

## Test Progression

### Phase 1: Foundation (Single Node)

| Test                       | Concept Introduced                             |
| -------------------------- | ---------------------------------------------- |
| 01-single-node-mock        | 1 node, 1 task, 1 step, mock action            |
| 02-single-node-two-steps   | Step sequencing within a task                  |
| 03-single-node-with-input  | Input schema → context.input → step mapping    |
| 04-single-node-with-output | Step output → context.output → workflow output |

### Phase 2: Linear Routing

| Test                          | Concept Introduced                               |
| ----------------------------- | ------------------------------------------------ |
| 05-two-nodes-unconditional    | Transition without condition                     |
| 06-two-nodes-condition-true   | Comparison condition evaluates true              |
| 07-two-nodes-condition-false  | Condition false → no route → workflow completes  |
| 08-three-nodes-priority-tiers | Lower priority wins, higher skipped              |
| 09-three-nodes-same-priority  | Same priority → both execute (parallel dispatch) |

### Phase 3: Fan-Out

| Test                     | Concept Introduced                                   |
| ------------------------ | ---------------------------------------------------- |
| 10-fan-out-spawn-count-2 | spawn_count=2, no sync (both complete independently) |
| 11-fan-out-wait-all      | wait_for: 'all', merge: 'append'                     |
| 12-fan-out-wait-any      | wait_for: 'any', first wins                          |
| 13-fan-out-wait-m-of-n   | Quorum strategy                                      |
| 14-fan-out-foreach       | Dynamic spawn from collection                        |

### Phase 4: Complex Patterns

| Test                       | Concept Introduced                  |
| -------------------------- | ----------------------------------- |
| 15-nested-fan-out          | Fan-out inside fan-out              |
| 16-sequential-fan-outs     | Two sequential fan-out/fan-in pairs |
| 17-conditional-in-branch   | Condition inside a branch           |
| 18-branch-failure-handling | on_failure behavior in branches     |

## Infrastructure

### Test Kit (`packages/tests/src/kit.ts`)

- `runTestWorkflow(workflow, input)` — Scaffolds workspace, project, resources; executes; returns cleanup
- `executeWorkflow(workflowId, input)` — Streams events, returns trace object

### Mock Action (`services/executor/src/actions/mock.ts`)

- Generates data conforming to JSON schema
- `seed` option for reproducibility (omit for random)
- `delay` option for time jitter: `{ min_ms, max_ms }`

### Trace System (`packages/sdk/src/trace.ts`)

- `trace.tokens.creations()` — Token creation events
- `trace.tokens.statusTransitions(tokenId)` — Status sequence for a token
- `trace.routing.matches()` — Transition match events
- `trace.context.setFieldAt(path)` — Context write events
- `trace.completion.complete()` — Final output event

## Assertion Patterns

### Relational (Data Flow)

```typescript
// Value at point A equals value at point B
const written = trace.context.setFieldAt('state.code')?.payload.value;
const output = result.output.code;
expect(output).toBe(written);
```

### Structural (Coordinator)

```typescript
// Token lifecycle is correct
expect(trace.tokens.statusTransitions(tokenId)).toEqual([
  'pending',
  'dispatched',
  'executing',
  'completed',
]);

// Correct number of tokens created
expect(trace.tokens.creations()).toHaveLength(4);

// Fan-out created correct sibling structure
const creations = trace.tokens.creations();
const siblings = creations.filter((c) => c.payload.fan_out_transition_id === transitionId);
expect(siblings).toHaveLength(3);
expect(siblings.map((s) => s.payload.branch_index)).toEqual([0, 1, 2]);
```

### Shape (Schema Conformance)

```typescript
// Output conforms to expected shape
expect(output.score).toBeGreaterThanOrEqual(1);
expect(output.score).toBeLessThanOrEqual(100);
expect(['A', 'B', 'C', 'D', 'F']).toContain(output.grade);
```
