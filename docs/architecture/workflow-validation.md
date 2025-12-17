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

- Event sequence matters: `pending → executing → completed`
- Decision types matter: `CREATE_TOKEN`, `MARK_FOR_DISPATCH`, `ACTIVATE_FAN_IN`
- Payload values are irrelevant to coordinator correctness

**Structural snapshot example:**

```typescript
expect(trace.tokens.statusTransitions(tokenId)).toEqual(['pending', 'executing', 'completed']);
```

**Important:** Events arrive out-of-order over WebSocket. Each event has a `sequence` number assigned by the coordinator, but delivery is not guaranteed to be in sequence order. When asserting on event ordering, verify that sequences are unique and positive, not that they arrive monotonically:

```typescript
// ✅ Correct: verify uniqueness
const sequences = events.map((e) => e.sequence);
expect(sequences.every((s) => s > 0)).toBe(true);
expect(new Set(sequences).size).toBe(sequences.length);

// ❌ Wrong: assumes delivery order matches sequence order
expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
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

### Phase 5: Sub-Workflows

| Test                             | Concept Introduced                                     |
| -------------------------------- | ------------------------------------------------------ |
| 19-subworkflow-basic             | workflow_call action invokes child workflow            |
| 20-subworkflow-input-mapping     | Parent context → child input (explicit mapping only)   |
| 21-subworkflow-output-mapping    | Child output → parent context                          |
| 22-subworkflow-context-isolation | Child cannot read/write parent state directly          |
| 23-subworkflow-in-fan-out        | Parallel sub-workflow invocations                      |
| 24-subworkflow-nested            | Sub-workflow invokes another sub-workflow (depth test) |

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
expect(trace.tokens.statusTransitions(tokenId)).toEqual(['pending', 'executing', 'completed']);

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

## Additional Strategies

### Unit Test the Planning Layer Directly

The planning functions are pure—no side effects, deterministic output:

```typescript
decideRouting({ completedToken, transitions, context }) → { decisions, events }
decideSynchronization({ token, transition, siblingCounts }) → { decisions, events }
```

E2E tests take ~500ms (SDK → HTTP → Coordinator → Executor → back). Direct unit tests take ~1ms.

500 routing scenarios can run in the time of one e2e test. Edge cases like "3 transitions, same priority, 2 match, 1 doesn't" become trivial to construct.

**E2E proves integration works. Unit tests prove logic is correct.** Both, not either/or.

### Global Invariants

Things that must be true for every workflow run, regardless of structure:

```typescript
function assertInvariants(trace: TraceEventCollection) {
  // Every token reaches terminal state
  for (const creation of trace.tokens.creations()) {
    const statuses = trace.tokens.statusTransitions(creation.payload.token_id);
    const terminal = ['completed', 'failed', 'cancelled', 'timed_out'];
    expect(terminal).toContain(statuses.at(-1));
  }

  // Events are monotonically sequenced
  const sequences = trace.all().map((e) => e.sequence);
  expect(sequences).toEqual([...sequences].sort((a, b) => a - b));

  // Every non-root token has a parent that was created
  const createdIds = new Set(trace.tokens.creations().map((c) => c.payload.token_id));
  for (const creation of trace.tokens.creations()) {
    if (creation.payload.parent_token_id) {
      expect(createdIds).toContain(creation.payload.parent_token_id);
    }
  }
}
```

Add `assertInvariants(trace)` to every test. Catches bugs even when specific assertions pass.

### Property-Based Testing for Planning

Instead of hand-crafted scenarios, generate random valid workflow graphs and assert invariants hold:

**Key invariants:**

- Total tokens created equals sum of all fan-out spawn counts
- Every token eventually reaches a terminal state
- Fan-in merge output length equals completed sibling count
- Context writes are monotonic (no overwrites without explicit merge)
- Matched transitions are always from the same priority tier

```typescript
// Using fast-check or similar
fc.assert(
  fc.property(
    arbitraryWorkflowGraph(), // Random valid graph
    arbitraryContext(), // Random context state
    (graph, context) => {
      const trace = runWorkflowSync(graph, context);

      // Invariant: token count matches spawn counts
      const expectedTokens = graph.transitions
        .filter((t) => t.matched)
        .reduce((sum, t) => sum + (t.spawn_count ?? 1), 1); // +1 for root
      expect(trace.tokens.creations()).toHaveLength(expectedTokens);

      // Invariant: all tokens terminal
      for (const creation of trace.tokens.creations()) {
        const final = trace.tokens.statusTransitions(creation.payload.token_id).at(-1);
        expect(['completed', 'failed', 'cancelled', 'timed_out']).toContain(final);
      }
    },
  ),
);
```

Finds edge cases you'd never think to write. The tricky part is generating valid graphs—but schemas exist, so it's feasible.

### State Machine Coverage Tracking

Explicitly track which token state transitions have been tested:

```typescript
const TOKEN_STATES = [
  'pending',
  'executing',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
  'waiting',
];

const VALID_TRANSITIONS = [
  ['pending', 'executing'],
  ['executing', 'completed'],
  ['executing', 'failed'],
  ['pending', 'cancelled'],
  ['waiting', 'executing'], // fan-in activation
  // ...
];

// After all tests run, verify coverage
const coveredTransitions = collectFromAllTests();
const uncovered = VALID_TRANSITIONS.filter((t) => !coveredTransitions.has(t));
expect(uncovered).toEqual([]); // Fail if any transition untested
```

### Decision Log Snapshots

Events are downstream of decisions. The coordinator's planning functions return `Decision[]` before dispatch converts them to operations. Snapshotting raw decisions is more direct than snapshotting events:

```typescript
expect(trace.decisions()).toMatchInlineSnapshot(`
  [
    { type: "CREATE_TOKEN", node_id: "start", ... },
    { type: "MARK_FOR_DISPATCH", token_id: "...", ... },
    { type: "ACTIVATE_FAN_IN", node_id: "collect", ... },
  ]
`);
```

**Fault isolation:**

- Decision wrong → bug is in routing/synchronization logic
- Decision correct but event wrong → bug is in dispatch layer

This separation makes diagnosis faster. Requires emitting decisions as trace events (currently internal to coordinator).

### Contract Tests

Coordinator and worker have a contract. Test the boundary in isolation:

**Coordinator contract:** Given state + completed token → produces `Decision[]`

```typescript
// Unit test
const decisions = decideRouting({
  completedToken: { id: 't1', node_id: 'start', status: 'completed', ... },
  transitions: [{ from: 'start', to: 'end', condition: null }],
  context: { input: {}, state: {}, output: {} },
});
expect(decisions).toEqual([
  { type: 'CREATE_TOKEN', params: { node_id: 'end', ... } }
]);
```

**Worker contract:** Given `TaskDef` + input → produces output | error

```typescript
// Unit test
const result = await executeTask({
  task: mockTaskDef,
  input: { value: 'test' },
});
expect(result).toEqual({ success: true, output: { processed: 'test' } });
```

**Integration:** The two compose correctly

If integration fails but unit tests pass, the bug is in the contract—serialization, schema mismatch, field naming (`input` vs `task_input`), etc.

### Chaos Mode

Jitter tests out-of-order completion. Chaos mode tests harder scenarios:

- **Coordinator delay:** What if coordinator is slow to process task results? (backpressure)
- **Worker restart:** What if worker dies mid-task and retries? (idempotency)
- **Concurrent completion:** What if two task results arrive in same event loop tick? (true races)

```typescript
// Chaos configuration
const chaos = {
  coordinatorDelayMs: { min: 0, max: 100 },
  workerRestartProbability: 0.1,
  concurrentCompletionProbability: 0.2,
};
```

Expensive to run. Should be a separate test suite that runs nightly, not on every commit. Catches races that bounded jitter won't.

### Priority

1. **Add invariant assertions now** — 1 hour of work, catches bugs forever
2. **Unit test planning layer** — Parallel effort, massive coverage gain
3. **Contract tests** — Test coordinator/worker boundary in isolation
4. **Decision log snapshots** — Requires plumbing decisions into trace events
5. **Property-based tests** — After unit tests exist, add generators
6. **Chaos mode** — Nightly runs for race condition detection
7. **State machine coverage tracking** — Nice-to-have, add when suite is mature

---

## Future Ideas (Not Part of Initial Plan)

These ideas have merit but are deferred until the core test suite is mature.

### Mutation Testing

Use a mutation testing tool (Stryker) to verify assertions are meaningful. The tool mutates coordinator/worker code and checks that tests fail. If a mutation survives, an assertion is missing.

**Why deferred:** Mutation testing validates assertion quality, but we're still building assertions. It's a quality check on a mature suite, not a bootstrapping tool.

### Graph Visualization

Generate Mermaid diagrams from test workflow definitions. Include as comments or co-located `.md` files:

````typescript
/**
 * ```mermaid
 * graph LR
 *   start --> question
 *   question -->|spawn_count: 3| generate
 *   generate --> collect
 *   collect --> end
 * ```
 */
````

When a test fails, humans/agents can see the graph instead of reconstructing it mentally from code.

**Why deferred:** The workflow definition _is_ the spec—agents can read it. Visualization helps onboarding when there are 50+ tests, but isn't essential for correctness.
