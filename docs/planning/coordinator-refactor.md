# Coordinator Refactor

## Current State

The coordinator service manages workflow execution. It receives commands (start, task completed, task failed, timeout, cancel), updates state, and dispatches work to the executor.

The architecture has the right concepts:
- **Planning layer** (`planning/*.ts`) - decides what should happen
- **Dispatch layer** (`dispatch/*.ts`) - executes decisions
- **Managers** (`operations/*.ts`) - handle state in SQLite

The problem is execution. `applyOne()` in `dispatch/apply.ts` is 600+ lines. It:
- Mixes decision logic with effect execution
- Recursively calls `applyDecisions()` in some branches
- Interleaves state mutations with RPC calls
- Has dynamic imports to avoid circular dependencies

## Target State

```
Input → Planning (pure) → Decision[] → Execution (simple loop)
```

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

Some decisions span both phases. `COMPLETE_WORKFLOW` updates status (phase 1) and notifies parent (phase 2).

## Changes Required

### 1. Define WorkflowState type
- New file: `src/state.ts`
- Consolidates what's currently spread across managers

### 2. Add state loading
- Load full state from SQLite at command entry
- Single function: `loadState(db): WorkflowState`

### 3. Refactor planning functions
- Change signatures to take `WorkflowState` instead of `DispatchContext`
- Remove manager reads from planning logic
- Ensure all decisions are returned (no recursion)

### 4. Split execution
- New function: `applyStateChanges(decisions, state, db)`
- New function: `executeEffects(decisions, env)`
- Replace `applyOne()` with two-phase loop

### 5. Remove DispatchContext from planning
- Planning only needs: `WorkflowState`, command-specific params
- Execution only needs: decisions, env bindings

## File Changes

| File | Change |
|------|--------|
| `src/state.ts` | New - WorkflowState type and loadState() |
| `src/types.ts` | Add WorkflowState, remove planning's dependency on DispatchContext |
| `src/planning/*.ts` | Change signatures to take WorkflowState |
| `src/dispatch/apply.ts` | Replace applyOne() with two-phase execution |
| `src/dispatch/state.ts` | New - applyStateChanges() |
| `src/dispatch/effects.ts` | New - executeEffects() |
| `src/index.ts` | Load state at command entry, pass to planning |

## Applies to Agent Service

The agent service (ConversationDO) follows the same pattern. Same refactor applies:
- Planning takes ConversationState, returns AgentDecision[]
- Execution is two-phase loop
- No recursive decision generation

The agent doc already describes this structure. The implementation should match.
