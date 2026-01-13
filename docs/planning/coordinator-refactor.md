# Coordinator Refactor

## Goal

Transform the coordinator into a pure state machine with predictable behavior, atomic state transitions, and clear separation between logic and effects.

## Current State

The coordinator service manages workflow execution. It receives events (start, task completed, task failed, timeout, cancel), updates state, and dispatches work to the executor.

The architecture has the right concepts:
- **Planning layer** (`planning/*.ts`) - decides what should happen
- **Dispatch layer** (`dispatch/*.ts`) - executes decisions
- **Managers** (`operations/*.ts`) - handle state in SQLite

The problem is execution. `applyOne()` in `dispatch/apply.ts` is 600+ lines. It:
- Mixes decision logic with effect execution
- Recursively calls `applyDecisions()` in some branches
- Interleaves state mutations with RPC calls
- Has dynamic imports to avoid circular dependencies
- Reads state during execution, blurring what planning saw vs what exists after

Additional problems:
- **No state machine enforcement**: Token status transitions happen ad-hoc with no validation
- **Ambiguous commit boundaries**: Unclear what state is committed when an effect fails
- **Testing requires mocks**: Planning reads from managers, so tests must mock them

## Target State

```
Event arrives
     ↓
loadState(db) → WorkflowState (immutable snapshot)
     ↓
plan(state, event) → Decision[] (pure function)
     ↓
validate(decisions, state) → throws if invalid transitions
     ↓
db.transaction(() => applyStateChanges(decisions))
     ↓
executeEffects(decisions, env) (idempotent, retriable)
     ↓
Done
```

### Properties of the Target Architecture

- **Testable**: Planning is pure. Pass in state, assert on decisions. No mocks.
- **Debuggable**: Log the state snapshot and decisions. Full replay capability.
- **Recoverable**: State commits atomically before effects. Failed effects can retry.
- **Explicit**: Token transitions are validated. Invalid states are impossible.
- **Simple**: Execution is two for-loops. No recursion, no dynamic decision generation.

### Planning: Pure Functions

Planning functions currently read from managers mid-execution:

```typescript
// Current: impure, reads from managers
function decideRouting(ctx: DispatchContext): Decision[] {
  const token = ctx.tokens.get(tokenId);  // side effect
  const context = ctx.context.getSnapshot();  // side effect
  // ... logic
}
```

Target: planning takes state as input, returns decisions as output:

```typescript
// Target: pure, state passed in
function decideRouting(state: WorkflowState, completedTokenId: string): Decision[] {
  const token = state.tokens.get(completedTokenId);
  const context = state.context;
  // ... logic
}
```

This makes planning:
- Testable without mocks
- Predictable (same input, same output)
- Easy to reason about

### Execution: Two-Phase Loop

Currently `applyOne()` handles each decision completely, interleaving state and external calls.

Target: separate phases.

```typescript
async function execute(decisions: Decision[], state: WorkflowState, env: Env): Promise<void> {
  // Phase 1: State mutations (synchronous, SQLite)
  for (const decision of decisions) {
    applyStateChange(decision, state);
  }

  // Phase 2: External effects (async, RPC)
  for (const decision of decisions) {
    await executeEffect(decision, env);
  }
}
```

Why two phases:
- State must exist before effects reference it (can't dispatch a token that doesn't exist)
- Clearer failure modes (state committed before external calls)
- Easier retry logic for failed external calls

### No Recursive Decisions

Currently some decision handlers generate more decisions:

```typescript
// Current: recursive
case 'FAIL_FROM_SUBWORKFLOW':
  await applyDecisions([{ type: 'FAIL_WORKFLOW', error: ... }], ctx);
```

Target: planning returns the complete flat list. No recursion in execution.

```typescript
// Target: planning generates full list
function planSubworkflowFailure(state: WorkflowState, tokenId: string, error: string): Decision[] {
  return [
    { type: 'UPDATE_TOKEN_STATUS', tokenId, status: 'failed' },
    { type: 'CANCEL_ACTIVE_TOKENS', reason: 'subworkflow failed' },
    { type: 'FAIL_WORKFLOW', error },
    // ... all decisions upfront
  ];
}
```

## State Shape

Define explicit state type for planning:

```typescript
type WorkflowState = {
  status: WorkflowStatus;
  tokens: Map<string, Token>;
  context: ContextSnapshot;
  fanIns: Map<string, FanIn>;
  subworkflows: Map<string, Subworkflow>;
  definitions: {
    workflow: WorkflowDef;
    nodes: Map<string, Node>;
    transitions: Map<string, Transition[]>;
  };
}
```

State is loaded from SQLite at the start of command processing, passed to planning, then mutations are written back.

## Decision Categories

Decisions fall into two categories for execution:

**State mutations** (Phase 1, SQLite):
- `CREATE_TOKEN`
- `UPDATE_TOKEN_STATUS`
- `MARK_WAITING`
- `SET_CONTEXT`
- `APPLY_OUTPUT_MAPPING`
- `INIT_BRANCH_TABLE`
- `APPLY_BRANCH_OUTPUT`
- `MERGE_BRANCHES`
- `DROP_BRANCH_TABLES`
- `INITIALIZE_WORKFLOW`
- `COMPLETE_WORKFLOW` (status update only)
- `FAIL_WORKFLOW` (status update only)

**External effects** (Phase 2, RPC):
- `DISPATCH_TOKEN` → Executor
- `COMPLETE_WORKFLOW` → Parent coordinator callback, RESOURCES update
- `FAIL_WORKFLOW` → Parent coordinator callback, RESOURCES update, cancel subworkflows
- `START_SUBWORKFLOW` → Child coordinator
- `SCHEDULE_ALARM` → DO alarm API

### Handling Decisions That Span Phases

Some decisions currently do both state mutation and external effects (e.g., `COMPLETE_WORKFLOW` updates status and notifies parent).

Solution: split these into separate decisions. Each decision belongs to exactly one phase.

```typescript
// Instead of one COMPLETE_WORKFLOW that does both:
{ type: 'SET_WORKFLOW_STATUS', status: 'completed', output: {...} }  // Phase 1
{ type: 'NOTIFY_PARENT', event: 'completed', output: {...} }         // Phase 2
{ type: 'UPDATE_RESOURCES_STATUS', status: 'completed' }             // Phase 2
```

Planning generates the full list. Execution is a simple loop over each phase.

## Token State Machine

Add explicit transition rules to catch invalid state changes immediately:

```typescript
// operations/token-states.ts
const TOKEN_TRANSITIONS: Record<TokenStatus, TokenStatus[]> = {
  'pending': ['dispatched', 'cancelled'],
  'dispatched': ['executing', 'failed', 'cancelled', 'timed_out'],
  'executing': ['completed', 'failed', 'timed_out', 'cancelled'],
  'waiting_for_siblings': ['completed', 'timed_out', 'cancelled'],
  'waiting_for_subworkflow': ['completed', 'failed', 'timed_out', 'cancelled'],
  'completed': [],
  'failed': [],
  'timed_out': [],
  'cancelled': [],
};

function assertValidTransition(from: TokenStatus, to: TokenStatus): void {
  const allowed = TOKEN_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid token transition: ${from} → ${to}`);
  }
}
```

Call this in `applyStateChanges` for any decision that changes token status.

## State Loading

### Why Load Everything?

Concern: For workflows with many tokens, loading all state upfront could be expensive.

Why it's not a problem:
1. **Durable Objects have colocated SQLite.** Reads are local, not network calls. Loading 1000 tokens is microseconds.
2. **We're already loading relevant state.** Current code calls `ctx.tokens.get()`, `ctx.tokens.getSiblings()`, etc. during planning. The reads happen anyway — just scattered.
3. **Correctness over premature optimization.** Get the architecture right first. If profiling shows state loading is a bottleneck, optimize the specific hot path.

### State Snapshot is Immutable

The loaded `WorkflowState` is a snapshot. Planning reads from it but doesn't mutate it. State changes are described by decisions, then applied to SQLite in the execution phase.

This enables:
- Comparing "before" and "after" state
- Logging exactly what planning saw
- Replaying decisions against known state for debugging

## Implementation Plan

### Phase 1: Foundation (No Breaking Changes)

**1. Define WorkflowState type**
- New file: `src/state.ts`
- Define `WorkflowState` type consolidating what's currently spread across managers
- Add `loadState(db): WorkflowState` function
- This is additive — existing code continues to work

**2. Add token state machine**
- New file: `src/operations/token-states.ts`
- Define `TOKEN_TRANSITIONS` map
- Add `assertValidTransition()` function
- Integrate into existing `TokenManager.updateStatus()` — immediate safety benefit

### Phase 2: Migrate Planning (One Function at a Time)

**3. Refactor `decideRouting`**
- Change signature to take `WorkflowState` instead of reading from managers
- Prove the pattern works on the most complex planning function
- Caller loads state and passes it in

**4. Refactor remaining planning functions**
- `decideSynchronization`
- `decideCompletion`
- `decideWorkflowStart`
- Each becomes a pure function of `WorkflowState`

### Phase 3: Two-Phase Execution

**5. Split decision types**
- Decisions that currently span phases get split (e.g., `COMPLETE_WORKFLOW` → `SET_WORKFLOW_STATUS` + `NOTIFY_PARENT`)
- Update planning to generate the split decisions

**6. Implement two-phase execution**
- New file: `src/dispatch/state-changes.ts` — `applyStateChanges(decisions, db)`
- New file: `src/dispatch/effects.ts` — `executeEffects(decisions, env)`
- Wrap state changes in SQLite transaction
- Replace `applyOne()` with two-phase loop

**7. Use handler registry**
- Organize state handlers and effect handlers in separate modules
- Each handler is independently testable
- No more 600-line switch statement

### Phase 4: Cleanup

**8. Remove DispatchContext from planning**
- Planning only needs: `WorkflowState`, event-specific params
- Execution only needs: decisions, env bindings
- Delete unused code paths

## File Changes

| File | Change |
|------|--------|
| `src/state.ts` | New — WorkflowState type and loadState() |
| `src/operations/token-states.ts` | New — state machine transitions |
| `src/types.ts` | Add WorkflowState, split decision types |
| `src/planning/*.ts` | Change signatures to take WorkflowState |
| `src/dispatch/apply.ts` | Replace with two-phase orchestration |
| `src/dispatch/state-changes.ts` | New — Phase 1 handlers |
| `src/dispatch/effects.ts` | New — Phase 2 handlers |
| `src/index.ts` | Load state at command entry, pass to planning |

## Testing Strategy

The refactor enables focused unit tests without mocks:

```typescript
// Planning tests - pure functions
describe('decideRouting', () => {
  it('creates tokens for matched transitions', () => {
    const state: WorkflowState = {
      tokens: new Map([['token-1', { id: 'token-1', nodeId: 'A', status: 'completed', ... }]]),
      definitions: {
        transitions: new Map([['A', [{ id: 't1', toNodeId: 'B', condition: null }]]]),
      },
      // ... minimal state for this test
    };

    const decisions = decideRouting(state, 'token-1');

    expect(decisions).toEqual([
      { type: 'CREATE_TOKEN', params: { nodeId: 'B', ... } },
    ]);
  });
});

// State change tests - verify SQLite mutations
describe('applyStateChanges', () => {
  it('creates token in database', () => {
    const db = createTestDb();
    const decisions = [{ type: 'CREATE_TOKEN', params: { ... } }];

    applyStateChanges(decisions, db);

    const tokens = db.select().from(tokensTable).all();
    expect(tokens).toHaveLength(1);
  });
});

// Effect tests - verify external calls
describe('executeEffects', () => {
  it('dispatches token to executor', async () => {
    const mockExecutor = { dispatch: vi.fn() };
    const decisions = [{ type: 'DISPATCH_TOKEN', tokenId: 'token-1' }];

    await executeEffects(decisions, { executor: mockExecutor });

    expect(mockExecutor.dispatch).toHaveBeenCalledWith('token-1');
  });
});
```

## Applies to Agent Service

The agent service (ConversationRunner) follows the same pattern. Same refactor applies:
- Planning takes ConversationState, returns AgentDecision[]
- Execution is two-phase loop
- No recursive decision generation

The agent doc already describes this structure. The implementation should match.

## ContextManager Split

The current `ContextManager` (`operations/context.ts`) has too many responsibilities:
- Schema validation
- Table creation and management
- Branch table lifecycle
- Merge strategy execution
- Path parsing and nested value access

Split into focused modules:

```
operations/
  context/
    index.ts          # ContextManager facade (thin wrapper)
    schema.ts         # Schema validation and table binding
    sections.ts       # Read/write for input, state, output sections
    branches.ts       # Branch table lifecycle
    merge.ts          # Merge strategy implementations
    paths.ts          # Path parsing, nested value access
```

Each module has a single responsibility. `ContextManager` becomes a thin facade that composes them.

This can happen in parallel with the main refactor — it's independent of the planning/execution changes.

## Cleanup Notes

**Dead code to remove:**
- `CHECK_SYNCHRONIZATION` decision type — Defined in `types.ts`, handled as no-op in `apply.ts`. The comment claims it "triggers synchronization planning" but it doesn't; synchronization is handled directly by `processSynchronization()` in `fan.ts`. Delete in Phase 4.

## Non-Goals

This refactor does not change:
- The fundamental Decision pattern (it's working)
- The Actor model / DO structure (it's appropriate)
- The schema or data model
- External APIs or behavior
