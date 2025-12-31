# Coordinator Service Refactor Plan

## Overview

This document outlines pattern improvements for the coordinator service based on direct code analysis. The goal is to improve maintainability, testability, and clarity without changing the fundamental architecture.

## Current Patterns

### What's Working Well

**Decision Pattern**
The separation between planning (pure functions returning `Decision[]`) and dispatch (executing decisions) is sound. Planning functions in `planning/routing.ts` and `planning/synchronization.ts` are mostly pure—they take data in, return `{ decisions, events }` out.

**Actor Model**
Each `WorkflowCoordinator` DO encapsulates isolated SQLite storage with single-threaded execution. No internal race conditions, natural fault isolation per workflow.

**Race-Safe Fan-In**
The two-phase fan-in activation (`tryCreateFanIn` + `tryActivateFanIn`) correctly prevents double-activation using SQL constraints.

### What Needs Improvement

**1. Giant Switch Statement in applyOne()**

Location: `dispatch/apply.ts:134-759`

The `applyOne` function is 600+ lines handling 20+ decision types in a single switch statement. This violates Open/Closed Principle—adding a new decision type requires modifying this file.

**2. Recursive Decision Execution**

Several decision handlers call `applyDecisions` recursively:

- `FAIL_FROM_SUBWORKFLOW` (line 705-708) generates `FAIL_WORKFLOW`
- `TIMEOUT_SUBWORKFLOW` (line 741-746) generates `FAIL_WORKFLOW`

This creates implicit control flow that's hard to trace and test.

**3. God Object: DispatchContext**

Location: `types.ts:98-121`

```typescript
type DispatchContext = {
  tokens, context, defs, status, subworkflows,
  emitter, logger, workflowRunId, rootRunId,
  resources, executor, coordinator, waitUntil, scheduleAlarm,
  enableTraceEvents
}
```

13 fields bundled together. Every function takes the whole world, obscuring actual dependencies and making testing harder.

**4. No Explicit Token State Machine**

Token status transitions are scattered across the codebase:
- `pending → dispatched` happens in multiple places
- `waiting_for_siblings → completed` in fan-in
- No validation that transitions are legal

Valid transitions aren't enforced systematically. Invalid state transitions fail silently or cause subtle bugs.

**5. ContextManager Has Too Many Responsibilities**

Location: `operations/context.ts`

This single class handles:
- Schema validation
- Table creation and management
- Branch table lifecycle
- Merge strategy execution
- Path parsing and nested value access

These are separate concerns that should be separate modules.

**6. Inconsistent Event Emission**

Some managers emit trace events directly (e.g., `TokenManager.create` at line 70-82), while others don't. No consistent policy on where tracing happens.

## Proposed Changes

### 1. Extract Decision Handlers

Replace the giant switch with a handler registry:

```typescript
// dispatch/handlers/index.ts
type DecisionHandler<T extends Decision> = {
  applyState: (decision: T, state: StateManager) => void;
  executeEffect?: (decision: T, env: Env) => Promise<void>;
};

const handlers: { [K in Decision['type']]: DecisionHandler<Extract<Decision, { type: K }>> } = {
  'CREATE_TOKEN': createTokenHandler,
  'UPDATE_TOKEN_STATUS': updateTokenStatusHandler,
  // ...
};
```

Each handler lives in its own file:
- `dispatch/handlers/create-token.ts`
- `dispatch/handlers/update-token-status.ts`
- etc.

Benefits:
- Adding new decisions doesn't modify existing code
- Each handler is independently testable
- Clear separation of state changes vs external effects

### 2. Formalize Token State Machine

Create explicit transition rules:

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

Call this in `TokenManager.updateStatus` to catch invalid transitions immediately.

### 3. Narrow DispatchContext to Role Interfaces

Instead of passing everything everywhere, define narrow interfaces:

```typescript
// For planning functions
interface PlanningDeps {
  getToken: (id: string) => TokenRow;
  getContext: () => ContextSnapshot;
  getTransitions: (nodeId: string) => TransitionRow[];
  getSiblingCounts: (group: string) => SiblingCounts;
}

// For state mutations
interface StateDeps {
  tokens: TokenManager;
  context: ContextManager;
  status: StatusManager;
}

// For external effects
interface EffectDeps {
  executor: Env['EXECUTOR'];
  coordinator: Env['COORDINATOR'];
  resources: Env['RESOURCES'];
  waitUntil: (p: Promise<unknown>) => void;
}
```

Functions declare exactly what they need. Tests only mock what's used.

### 4. Eliminate Recursive Decision Generation

Decisions that currently generate other decisions should instead return the full list upfront:

```typescript
// Current (recursive)
case 'FAIL_FROM_SUBWORKFLOW':
  ctx.tokens.updateStatus(decision.tokenId, 'failed');
  await applyDecisions([{ type: 'FAIL_WORKFLOW', error: ... }], ctx);

// Target (flat)
function planSubworkflowFailure(tokenId: string, error: string): Decision[] {
  return [
    { type: 'UPDATE_TOKEN_STATUS', tokenId, status: 'failed' },
    { type: 'FAIL_WORKFLOW', error: `Subworkflow failed: ${error}` },
  ];
}
```

Planning generates the complete list. Execution is a simple loop with no recursion.

### 5. Split ContextManager

Break into focused modules:

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

### 6. Standardize Event Emission

Establish a clear policy: managers handle data, the dispatch layer handles events.

Remove `emitter` from manager constructors. Instead, the dispatch layer emits events after calling manager methods:

```typescript
// dispatch/handlers/create-token.ts
export const createTokenHandler: DecisionHandler<CreateTokenDecision> = {
  applyState: (decision, state) => {
    const tokenId = state.tokens.create(decision.params);
    return { createdTokenId: tokenId };
  },

  emitEvents: (decision, result, emitter) => {
    emitter.emit({
      eventType: 'token.created',
      metadata: { tokenId: result.createdTokenId, nodeId: decision.params.nodeId },
    });
  },
};
```

Events are consistently emitted from one layer, making tracing predictable.

## Implementation Order

1. **Extract decision handlers** — Highest impact, unblocks other changes
2. **Formalize token state machine** — Small, low-risk, immediate safety benefit
3. **Eliminate recursive decisions** — Required before narrowing DispatchContext
4. **Narrow DispatchContext** — Cleaner interfaces, better testability
5. **Split ContextManager** — Can happen in parallel with other changes
6. **Standardize event emission** — Do alongside handler extraction

## Files Affected

| Current File | Change |
|--------------|--------|
| `dispatch/apply.ts` | Replace `applyOne` switch with handler dispatch |
| `dispatch/handlers/*.ts` | New — one file per decision type |
| `operations/tokens.ts` | Add state machine validation |
| `operations/context.ts` | Split into `context/*.ts` modules |
| `types.ts` | Add narrow interface types |
| `planning/*.ts` | Update signatures to use narrow interfaces |
| `index.ts` | Build narrow deps from managers |

## Testing Strategy

The handler extraction enables focused unit tests:

```typescript
// dispatch/handlers/create-token.test.ts
describe('createTokenHandler', () => {
  it('creates token with correct params', () => {
    const mockTokens = { create: vi.fn().mockReturnValue('token-123') };
    const decision = { type: 'CREATE_TOKEN', params: { ... } };

    createTokenHandler.applyState(decision, { tokens: mockTokens });

    expect(mockTokens.create).toHaveBeenCalledWith(decision.params);
  });
});
```

Each handler tested in isolation. No need to mock 13 fields of DispatchContext.

## Non-Goals

This refactor does not address:
- Changing the fundamental Decision pattern (it's working)
- Modifying the Actor model / DO structure (it's appropriate)
- Adding new features (purely structural improvement)
- Changing the schema or data model