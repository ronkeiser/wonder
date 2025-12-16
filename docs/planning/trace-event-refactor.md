# Trace Event Emission Refactor Plan

## Overview

Standardize trace event emissions across the coordinator service to ensure consistency, eliminate duplication, and improve debugging capabilities.

## Current Issues

### 1. **Inconsistent Naming Conventions**

- Operation events use present tense: `operation.tokens.create`, `operation.tokens.update_status`
- Dispatch events mix past and present: `dispatch.token.created` (past) vs `dispatch.batch.start` (present)
- No clear standard across the codebase

### 2. **Duplicate Event Emissions**

Many operations emit trace events at BOTH the operation layer AND dispatch layer:

| Operation           | Operation Layer                         | Dispatch Layer                      |
| ------------------- | --------------------------------------- | ----------------------------------- |
| Token creation      | `operation.tokens.create`               | `dispatch.token.created`            |
| Token status update | `operation.tokens.update_status`        | `dispatch.token.status_updated`     |
| Branch table init   | `operation.context.branch_table.create` | `dispatch.branch.table_initialized` |
| Branch output       | `operation.context.branch.write`        | `dispatch.branch.output_applied`    |
| Context set         | `operation.context.set_field`           | `dispatch.context.set`              |
| Branch merge        | `operation.context.merge.complete`      | `dispatch.branch.merged`            |
| Branch table drop   | `operation.context.branch_table.drop`   | `dispatch.branch.tables_dropped`    |

This creates duplicate trace events for the same logical operation, cluttering logs and confusing analysis.

### 3. **Inconsistent Data Inclusion**

- Some events include full data: `operation.context.output_mapping.apply` includes `extracted_value`
- Others omit data: `dispatch.context.set` doesn't include the value being set
- Missing context: Some events omit `token_id` or `node_id` even when available

### 4. **Mixed Event Building Patterns**

- Most places: inline object creation `ctx.emitter.emitTrace({ type: '...', ... })`
- Some places: pre-built events `for (const event of result.events) ctx.emitter.emitTrace(event)`
- No consistency in approach

## Core Principles

### 1. **Single Layer Emission**

- **Operation layer** (`operation.*`): Emit when the actual state change occurs (database write, table creation, etc.)
- **Dispatch layer** (`dispatch.*`): Emit only for dispatch-specific concerns (batching, decision application, workflow lifecycle)
- **Decision layer** (`decision.*`): Emit during planning/routing (pure functions)
- **Never emit both operation and dispatch** for the same logical operation

### 2. **Naming Convention**

- **Operation events**: Use **past tense** (describes what happened): `created`, `updated`, `written`, `dropped`
- **Dispatch events**: Use **present tense** (describes orchestration action): `start`, `complete`, `apply`
- **Decision events**: Use **present tense** (describes planning action): `start`, `evaluate`, `complete`
- **Format**: `{layer}.{domain}.{action}`

### 3. **Required Context Fields**

Always include when available:

- `token_id` - if the operation relates to a specific token
- `node_id` - if the operation relates to a specific node
- `duration_ms` - for performance-critical operations

### 4. **Data Inclusion Policy**

- ✅ Include: identifiers (IDs, paths, references)
- ✅ Include: counts and metrics
- ✅ Include: values for context operations (reads/writes)
- ❌ Exclude: large payloads (use IDs/references instead)

## Phase 1: Define Event Ownership

### Event Layer Assignments

**Operation Layer** (`operation.*`) - Owns state mutation:

```
✓ operation.tokens.created (rename from: create)
✓ operation.tokens.status_updated (rename from: update_status)
✓ operation.context.initialized
✓ operation.context.validated
✓ operation.context.read
✓ operation.context.field_set (rename from: set_field)
✓ operation.context.section_replaced (rename from: replace_section)
✓ operation.context.snapshot
✓ operation.context.branch_table.created (rename from: create)
✓ operation.context.branch_table.dropped (rename from: drop)
✓ operation.context.branch.validated
✓ operation.context.branch.written (rename from: write)
✓ operation.context.branches_read (rename from: read_all)
✓ operation.context.merged (already correct - from merge.complete)
✓ operation.context.output_mapping.started (rename from: start)
✓ operation.context.output_mapping.skipped (rename from: skip)
✓ operation.context.output_mapping.applied (rename from: apply)
✓ operation.metadata.* (all already correct)
```

**Dispatch Layer** (`dispatch.*`) - Owns orchestration:

```
✓ dispatch.batch.start
✓ dispatch.batch.complete
✓ dispatch.decision.planned
✗ dispatch.token.created (REMOVE - duplicate of operation.tokens.created)
✗ dispatch.tokens.batch_created (REMOVE - covered by batch metrics)
✗ dispatch.token.status_updated (REMOVE - duplicate of operation.tokens.status_updated)
✗ dispatch.tokens.batch_status_updated (REMOVE - covered by batch metrics)
✗ dispatch.token.marked_waiting (REMOVE - duplicate of operation.tokens.status_updated)
✗ dispatch.token.marked_for_dispatch (REMOVE - duplicate of operation.tokens.status_updated)
✗ dispatch.context.set (REMOVE - duplicate of operation.context.field_set)
✗ dispatch.context.output_applied (REMOVE - duplicate of operation.context.output_mapping.applied)
✗ dispatch.branch.table_initialized (REMOVE - duplicate of operation.context.branch_table.created)
✗ dispatch.branch.output_applied (REMOVE - duplicate of operation.context.branch.written)
✗ dispatch.branch.merged (REMOVE - duplicate of operation.context.merged)
✗ dispatch.branch.tables_dropped (REMOVE - duplicate of operation.context.branch_table.dropped)
✗ dispatch.sync.check_requested (REMOVE - not actionable, covered by decision layer)
✓ dispatch.sync.fan_in_activated (KEEP - dispatch-level orchestration)
✓ dispatch.error (KEEP - error handling)
✓ dispatch.workflow.completed (KEEP - lifecycle)
✓ dispatch.workflow.failed (KEEP - lifecycle)
```

**Decision Layer** (`decision.*`) - Already consistent:

```
✓ decision.routing.start
✓ decision.routing.evaluate_transition
✓ decision.routing.transition_matched
✓ decision.routing.complete
✓ decision.sync.start
✓ decision.sync.check_condition
✓ decision.sync.wait
✓ decision.sync.activate
✓ decision.sync.sibling_group_check
✓ decision.sync.skipped_wrong_sibling_group
✓ decision.sync.continuation
✓ decision.lifecycle.start
✓ decision.lifecycle.root_token_planned
✓ decision.completion.start
✓ decision.completion.no_mapping
✓ decision.completion.extract
✓ decision.completion.complete
```

**SQL Layer** (`sql.*`) - Already consistent:

```
✓ sql.query
```

**Debug Layer** (`debug.*`) - Already consistent:

```
✓ debug.fan_in.start
✓ debug.fan_in.try_activate_result
```

## Phase 2: Update Type Definitions

### File: `services/events/src/types.ts`

**Changes needed:**

1. Rename operation events to past tense
2. Remove duplicate dispatch events
3. Add deprecated type aliases for backward compatibility (temporary)
4. Ensure all events include optional `token_id` and `node_id` fields

**Updated operation event types:**

```typescript
export type OperationEvent =
  // Tokens
  | { type: 'operation.tokens.created'; ... }          // was: create
  | { type: 'operation.tokens.status_updated'; ... }    // was: update_status

  // Context
  | { type: 'operation.context.initialized'; ... }
  | { type: 'operation.context.validated'; ... }
  | { type: 'operation.context.read'; ... }
  | { type: 'operation.context.field_set'; ... }        // was: set_field
  | { type: 'operation.context.section_replaced'; ... } // was: replace_section
  | { type: 'operation.context.snapshot'; ... }

  // Output mapping
  | { type: 'operation.context.output_mapping.started'; ... }  // was: start
  | { type: 'operation.context.output_mapping.skipped'; ... }  // was: skip
  | { type: 'operation.context.output_mapping.applied'; ... }  // was: apply

  // Branch storage
  | { type: 'operation.context.branch_table.created'; ... }    // was: create
  | { type: 'operation.context.branch_table.dropped'; ... }    // was: drop
  | { type: 'operation.context.branch.validated'; ... }
  | { type: 'operation.context.branch.written'; ... }          // was: write
  | { type: 'operation.context.branches_read'; ... }           // was: read_all

  // Merge
  | { type: 'operation.context.merge.started'; ... }           // was: start
  | { type: 'operation.context.merged'; ... }                  // was: complete (from merge.complete)

  // Metadata (already correct)
  | { type: 'operation.metadata.table_init'; ... }
  | { type: 'operation.metadata.table_init_error'; ... }
  | { type: 'operation.metadata.cache_hit'; ... }
  | { type: 'operation.metadata.cache_miss'; ... }
  | { type: 'operation.metadata.fetch_start'; ... }
  | { type: 'operation.metadata.fetch_success'; ... }
  | { type: 'operation.metadata.fetch_error'; ... }
  | { type: 'operation.metadata.save'; ... };
```

**Simplified dispatch event types:**

```typescript
export type DispatchEvent =
  // Batching
  | { type: 'dispatch.batch.start'; decision_count: number }
  | {
      type: 'dispatch.batch.complete';
      total_decisions: number;
      applied: number;
      tokens_created: number;
      tokens_dispatched: number;
      errors: number;
      duration_ms?: number;
    }

  // Decision tracking
  | {
      type: 'dispatch.decision.planned';
      decision_type: string;
      source: string;
      token_id?: string;
      timestamp: number;
    }

  // Error handling
  | { type: 'dispatch.error'; decision_type: string; error: string }

  // Synchronization (orchestration-level only)
  | {
      type: 'dispatch.sync.fan_in_activated';
      node_id: string;
      fan_in_path: string;
      merged_count: number;
    }

  // Workflow lifecycle
  | { type: 'dispatch.workflow.completed'; has_output: boolean }
  | { type: 'dispatch.workflow.failed'; error: string };
```

## Phase 3: Implementation Order

### 3.1: Update Type Definitions ✅ (Low Risk)

**File:** `services/events/src/types.ts`

Tasks:

- [x] Identify all event type changes needed
- [ ] Update `OperationEvent` union with renamed types
- [ ] Update `DispatchEvent` union with removed duplicates
- [ ] Add inline comments showing old → new mappings
- [ ] Run type checks: `cd services/events && pnpm typecheck`

**Testing:**

- Type checking will catch all usage sites
- No runtime changes yet

---

### 3.2: Update Operation Layer (Medium Risk)

#### 3.2.1: File: `services/coordinator/src/operations/tokens.ts`

**Changes:**

```typescript
// Line ~93: Token creation
this.emitter.emitTrace({
  type: 'operation.tokens.created', // was: create
  token_id: tokenId,
  node_id: params.node_id,
  task_id: params.node_id,
  parent_token_id: params.parent_token_id,
  fan_out_transition_id: params.fan_out_transition_id,
  branch_index: params.branch_index,
  branch_total: params.branch_total,
});

// Line ~135: Status update
this.emitter.emitTrace({
  type: 'operation.tokens.status_updated', // was: update_status
  token_id: tokenId,
  from: token.status,
  to: status,
  node_id: token.node_id, // ADD THIS
});

// Line ~220: Mark waiting
this.emitter.emitTrace({
  type: 'operation.tokens.status_updated', // was: update_status
  token_id: tokenId,
  from: token.status,
  to: 'waiting_for_siblings',
  node_id: token.node_id, // ADD THIS
});

// Line ~322 & ~349: Complete/cancel many
// Same pattern - add node_id to each emission
```

**Testing:**

```bash
cd services/coordinator
pnpm typecheck
pnpm test operations/tokens.test.ts
```

---

#### 3.2.2: File: `services/coordinator/src/operations/context.ts`

**Changes:**

```typescript
// Line ~157: Initialize
this.emitter.emitTrace({
  type: 'operation.context.initialized', // already correct
  has_input_schema: true,
  has_context_schema: this.stateTable !== null,
  table_count: tablesCreated.length,
  tables_created: tablesCreated,
});

// Line ~225: Read
this.emitter.emitTrace({
  type: 'operation.context.read', // already correct
  path: section,
  value,
});

// Line ~267: Replace section
this.emitter.emitTrace({
  type: 'operation.context.section_replaced', // was: replace_section
  section,
  data,
});

// Line ~294: Set field
this.emitter.emitTrace({
  type: 'operation.context.field_set', // was: set_field
  path,
  value,
});

// Line ~349: Output mapping start
this.emitter.emitTrace({
  type: 'operation.context.output_mapping.started', // was: start
  output_mapping: outputMapping,
  task_output_keys: Object.keys(taskOutput),
});

// Line ~356: Output mapping skip
this.emitter.emitTrace({
  type: 'operation.context.output_mapping.skipped', // was: skip
  reason: 'no_mapping',
});

// Line ~370: Output mapping apply
this.emitter.emitTrace({
  type: 'operation.context.output_mapping.applied', // was: apply
  target_path: targetPath,
  source_path: sourcePath,
  extracted_value: value,
});

// Line ~467: Branch table create
this.emitter.emitTrace({
  type: 'operation.context.branch_table.created', // was: create
  token_id: tokenId,
  table_name: tableName,
  schema_type: 'object',
});

// Line ~488: Branch validate
// Already correct

// Line ~504: Branch write
this.emitter.emitTrace({
  type: 'operation.context.branch.written', // was: write
  token_id,
  output,
});

// Line ~544: Branch read all
this.emitter.emitTrace({
  type: 'operation.context.branches_read', // was: read_all
  token_ids: tokenIds,
  output_count: branchOutputs.length,
});

// Line ~558: Merge start
this.emitter.emitTrace({
  type: 'operation.context.merge.started', // was: start
  sibling_count: branchOutputs.length,
  strategy: merge.strategy,
  source_path: '_branch.output',
  target_path: merge.target,
});

// Line ~612: Merge complete
this.emitter.emitTrace({
  type: 'operation.context.merged', // was: merge.complete
  target_path: merge.target,
  branch_count: branchOutputs.length,
});

// Line ~633: Drop branch tables
this.emitter.emitTrace({
  type: 'operation.context.branch_table.dropped', // was: drop
  token_ids: tokenIds,
  tables_dropped: tokenIds.length,
});
```

**Testing:**

```bash
cd services/coordinator
pnpm typecheck
pnpm test operations/context.test.ts
```

---

### 3.3: Update Dispatch Layer (High Risk)

#### 3.3.1: File: `services/coordinator/src/dispatch/apply.ts`

**Major changes - remove all duplicate emissions:**

```typescript
// Line ~115-120: REMOVE dispatch.error trace (keep logger.error only)

// Line ~124-132: Keep dispatch.batch.complete but enhance:
ctx.emitter.emitTrace({
  type: 'dispatch.batch.complete',
  total_decisions: decisions.length,
  batched_decisions: batched.length,
  applied: result.applied,
  tokens_created: result.tokensCreated.length,
  tokens_dispatched: result.tokensDispatched.length,
  errors: result.errors.length,
  duration_ms: performance.now() - startTime, // ADD THIS
});

// Line ~144-149: Keep dispatch.decision.planned (already correct)

// Line ~177-181: REMOVE dispatch.token.created
// Operation layer handles this

// Line ~191-194: REMOVE dispatch.tokens.batch_created
// Covered by dispatch.batch.complete metrics

// Line ~200-204: REMOVE dispatch.token.status_updated
// Operation layer handles this

// Line ~212-215: REMOVE dispatch.tokens.batch_status_updated
// Covered by dispatch.batch.complete metrics

// Line ~221-224: REMOVE dispatch.token.marked_waiting
// Operation layer handles this via status_updated

// Line ~230-233: REMOVE dispatch.token.marked_for_dispatch
// Operation layer handles this via status_updated

// Line ~240-243: REMOVE dispatch.context.set
// Operation layer handles this

// Line ~250-253: REMOVE dispatch.context.output_applied
// Operation layer handles this

// Line ~260-263: REMOVE dispatch.branch.table_initialized
// Operation layer handles this

// Line ~269-272: REMOVE dispatch.branch.output_applied
// Operation layer handles this

// Line ~284-289: REMOVE dispatch.branch.merged
// Operation layer handles this

// Line ~295-298: REMOVE dispatch.branch.tables_dropped
// Operation layer handles this

// Line ~306-310: REMOVE dispatch.sync.check_requested
// Not actionable, covered by decision layer

// Line ~316-321: KEEP dispatch.sync.fan_in_activated
// This is dispatch-level orchestration

// Line ~327-330: KEEP dispatch.workflow.completed

// Line ~335-338: KEEP dispatch.workflow.failed
```

**After cleanup, apply.ts should only emit:**

- `dispatch.decision.planned` (when processing traced decisions)
- `dispatch.batch.complete` (after batch processing)
- `dispatch.error` (on decision application errors)
- `dispatch.sync.fan_in_activated` (fan-in orchestration)
- `dispatch.workflow.completed` (workflow completion)
- `dispatch.workflow.failed` (workflow failure)

**Testing:**

```bash
cd services/coordinator
pnpm typecheck
pnpm test dispatch/apply.test.ts
```

---

#### 3.3.2: Files: `dispatch/task.ts`, `dispatch/fan.ts`, `dispatch/lifecycle.ts`

**Changes:**

- Remove any direct trace emissions that duplicate operations
- Keep forwarding of decision events from planning functions
- Keep dispatch-level batch start/complete emissions

**Example from task.ts line 36:**

```typescript
// Keep this - it's a dispatch batch event
ctx.emitter.emitTrace({
  type: 'dispatch.batch.start',
  decision_count: 1,
});
```

**Testing:**

```bash
cd services/coordinator
pnpm test dispatch/
```

---

### 3.4: Update Tests (Low Risk)

#### 3.4.1: Update SDK Trace Helpers

**File:** `packages/sdk/src/trace.ts`

Update payload type names to match new event types:

```typescript
export namespace TracePayloads {
  export interface TokenCreated {
    // was: TokenCreate
    token_id: string;
    node_id: string;
    parent_token_id: string | null;
    // ...
  }

  export interface TokenStatusUpdated {
    // was: TokenUpdateStatus
    token_id: string;
    from: string;
    to: string;
    node_id?: string; // ADD
  }

  // ... update all others similarly
}
```

**Testing:**

```bash
cd packages/sdk
pnpm typecheck
pnpm test trace.test.ts
```

---

#### 3.4.2: Update Test Assertions

**Files:** `services/coordinator/test/**/*.test.ts`

Update all trace event assertions:

```typescript
// Before:
const event = traces.find('operation.tokens.create');

// After:
const event = traces.find('operation.tokens.created');
```

Search and replace across test files:

```bash
cd services/coordinator
grep -r "operation.tokens.create" test/
grep -r "dispatch.token.created" test/
# ... etc for all renamed events
```

**Testing:**

```bash
cd services/coordinator
pnpm test
```

---

## Phase 4: Validation

### 4.1: Type Safety ✅

```bash
# From workspace root
pnpm typecheck

# Individual packages
cd services/events && pnpm typecheck
cd services/coordinator && pnpm typecheck
cd packages/sdk && pnpm typecheck
```

**Success criteria:**

- Zero TypeScript errors
- All event types properly inferred

---

### 4.2: Test Coverage ✅

```bash
# Coordinator tests
cd services/coordinator
pnpm test

# SDK tests
cd packages/sdk
pnpm test

# Integration tests (if any)
pnpm test:integration
```

**Success criteria:**

- All tests pass
- No test failures due to missing events
- No duplicate event assertions

---

### 4.3: Runtime Validation 🔬

**Deploy to staging:**

```bash
# Deploy events service
cd services/events
pnpm deploy:staging

# Deploy coordinator service
cd services/coordinator
pnpm deploy:staging
```

**Run test workflows:**

```bash
# Use SDK to run sample workflows
cd packages/sdk
pnpm test:integration:staging
```

**Verify event stream:**

1. Check logs service for trace events
2. Verify no duplicate events for same operation
3. Verify all expected events present
4. Check event counts match expectations

**Success criteria:**

- No duplicate events (e.g., both `operation.tokens.created` and `dispatch.token.created`)
- All operations emit expected trace events
- Event payload structure matches type definitions
- Performance acceptable (trace overhead < 5%)

---

## Phase 5: Documentation

### 5.1: Create Trace Event Style Guide

**File:** `docs/architecture/trace-events.md`

**Content:**

````markdown
# Trace Event Style Guide

## Event Naming Conventions

### Layer Prefixes

- `decision.*` - Planning/routing decisions (pure functions)
- `operation.*` - State mutations (DB writes, table changes)
- `dispatch.*` - Orchestration (batching, lifecycle)
- `sql.*` - Database queries
- `debug.*` - Debugging/troubleshooting

### Tense

- **Operation events**: Past tense (`created`, `updated`, `written`)
- **Dispatch events**: Present tense (`start`, `complete`, `apply`)
- **Decision events**: Present tense (`start`, `evaluate`, `complete`)

### Format

`{layer}.{domain}.{action}`

Examples:

- ✅ `operation.tokens.created`
- ✅ `dispatch.batch.complete`
- ✅ `decision.routing.start`
- ❌ `operation.tokens.create` (wrong tense)
- ❌ `dispatch.token.created` (duplicate of operation)

## When to Emit

### Operation Layer

Emit when **actual state changes**:

- Database INSERT/UPDATE/DELETE
- Table CREATE/DROP
- File writes
- Cache updates

### Dispatch Layer

Emit for **orchestration concerns**:

- Batch processing start/complete
- Decision planning/application
- Workflow lifecycle events
- Error handling

### Decision Layer

Emit during **planning** (pure functions):

- Routing evaluation
- Synchronization checks
- Output extraction planning

## Required Fields

Always include when available:

```typescript
{
  type: string;           // REQUIRED
  token_id?: string;      // Include if operation relates to token
  node_id?: string;       // Include if operation relates to node
  duration_ms?: number;   // Include for performance tracking
  // ... event-specific fields
}
```
````

## Data Inclusion

✅ **Include:**

- Identifiers (IDs, paths, references)
- Counts and metrics
- Values for context operations
- Error messages

❌ **Exclude:**

- Large payloads (use IDs instead)
- Sensitive data (PII, secrets)
- Redundant information

## Examples

### Good ✅

```typescript
// Operation layer - actual state change
this.emitter.emitTrace({
  type: 'operation.tokens.created',
  token_id: tokenId,
  node_id: params.node_id,
  parent_token_id: params.parent_token_id,
});

// Dispatch layer - orchestration
ctx.emitter.emitTrace({
  type: 'dispatch.batch.complete',
  total_decisions: 10,
  applied: 10,
  errors: 0,
  duration_ms: 45,
});
```

### Bad ❌

```typescript
// DON'T: Duplicate emission at both layers
// operations/tokens.ts
this.emitter.emitTrace({ type: 'operation.tokens.created', ... });

// dispatch/apply.ts
ctx.emitter.emitTrace({ type: 'dispatch.token.created', ... });  // ❌ Duplicate!

// DON'T: Missing context
ctx.emitter.emitTrace({
  type: 'operation.tokens.status_updated',
  token_id: tokenId,
  // Missing: node_id (available but not included)
});

// DON'T: Wrong tense
this.emitter.emitTrace({
  type: 'operation.tokens.create',  // ❌ Should be 'created'
});
```

````

---

### 5.2: Update Architecture Docs

**File:** `docs/architecture/coordinator.md`

Add section:
```markdown
## Trace Events

The coordinator emits trace events at three layers:

1. **Decision Layer** - Planning and routing logic
2. **Operation Layer** - State mutations (tokens, context, metadata)
3. **Dispatch Layer** - Orchestration (batching, lifecycle)

See [Trace Event Style Guide](./trace-events.md) for emission patterns.

### Event Flow

````

Decision Layer (Pure)
↓ emits: decision._
Operations (Mutations)
↓ emits: operation._
Dispatch (Orchestration)
↓ emits: dispatch.\*
Events Service
↓ stores to D1
Logs Service / WebSocket

```

```

---

**File:** `docs/architecture/logs-events-decisions.md`

Update trace event section with new conventions.

---

## Migration Strategy

### Recommended: Big Bang Approach ✅

**Why:**

- Atomic change - no inconsistent state
- Easier code review (single PR)
- All tests updated together
- Clear before/after comparison

**How:**

1. Create feature branch: `refactor/trace-events-standardization`
2. Make all changes in sequence (phases 1-3)
3. Run full test suite
4. Deploy to staging for validation
5. Merge to main after approval

**Timeline:**

- Phase 1-2 (types): 2-3 hours
- Phase 3 (implementation): 4-6 hours
- Phase 4 (validation): 2-3 hours
- Phase 5 (docs): 2-3 hours
- **Total**: 10-15 hours of focused work

---

### Alternative: Incremental Approach

**Why use:**

- Large team needs incremental review
- Cannot afford downtime risk
- Need to validate at each step

**How:**

1. PR 1: Add new event types alongside old ones (backward compatible)
2. PR 2: Update operation layer to use new types
3. PR 3: Update dispatch layer to use new types
4. PR 4: Remove old event types
5. PR 5: Update documentation

**Risks:**

- Temporary duplication (old + new events)
- Longer migration window
- More merge conflicts
- Confusion about which events to use

**Not recommended** unless organizational constraints require it.

---

## Rollback Plan

### If issues discovered in staging:

1. **Quick fix approach:**

   ```typescript
   // In events service, accept both old and new type names
   const normalizedType = type
     .replace('operation.tokens.create', 'operation.tokens.created')
     .replace('dispatch.token.created', 'operation.tokens.created');
   // ... etc
   ```

2. **Full rollback:**
   - Revert coordinator deployment
   - Events service already stores raw strings - no data loss
   - Old events still queryable

### If issues discovered in production:

1. **Immediate:** Deploy coordinator rollback
2. **Events service:** No changes needed (stores strings, not typed)
3. **Investigation:** Use staging environment to debug
4. **Fix forward:** Address specific issues, redeploy

**Risk mitigation:**

- Comprehensive test coverage before merge
- Staging validation before production
- Gradual production rollout (canary deployment)
- Monitoring dashboards for event counts/patterns

---

## Success Criteria

### Quantitative Metrics

- [ ] **Zero duplicate events** - Same operation emits at most one trace event
- [ ] **100% type safety** - All trace emissions type-checked at compile time
- [ ] **All tests pass** - Coordinator, SDK, integration tests green
- [ ] **Performance acceptable** - Trace overhead < 5% of execution time
- [ ] **Event count reduction** - ~40% fewer trace events (eliminating duplicates)

### Qualitative Goals

- [ ] **Consistent naming** - All events follow tense conventions
- [ ] **Clear ownership** - Obvious which layer emits which events
- [ ] **Better debugging** - Easier to trace execution through logs
- [ ] **Documentation complete** - Style guide and examples available
- [ ] **Team alignment** - All developers understand new patterns

### Validation Checklist

**Before merge:**

- [ ] TypeScript compilation succeeds
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Code review approved
- [ ] Documentation reviewed

**After staging deploy:**

- [ ] Sample workflows execute successfully
- [ ] No duplicate events in trace logs
- [ ] All expected events present
- [ ] Performance within acceptable range
- [ ] WebSocket streaming works

**After production deploy:**

- [ ] Monitor error rates (should not increase)
- [ ] Monitor event volume (should decrease ~40%)
- [ ] Monitor workflow success rates (should remain stable)
- [ ] User-facing features unaffected

---

## Open Questions

### 1. Should we version trace events?

**Question:** Add version field to trace events for future evolution?

**Options:**

- A) Add `version: 1` to all events now
- B) Don't version, rely on type name changes
- C) Version only at schema level (events service)

**Recommendation:** B - Type name changes sufficient for now. Add versioning later if needed.

---

### 2. Should we batch trace emissions?

**Question:** Currently each `emitTrace()` is async and independent. Should we batch?

**Options:**

- A) Keep current pattern (fire and forget)
- B) Batch within coordinator, flush periodically
- C) Batch at events service level

**Recommendation:** A - Current pattern is simple and async. Batching adds complexity without clear benefit.

---

### 3. Should we add trace event sampling?

**Question:** In high-traffic scenarios, should we sample trace events?

**Options:**

- A) Emit all trace events always (current)
- B) Add sampling rate configuration (e.g., 10%)
- C) Sample based on event type (keep errors, sample debug)

**Recommendation:** A for now - Optimize later if trace volume becomes a problem.

---

## Next Steps

1. **Review this plan** with team
2. **Address open questions**
3. **Create tracking issue** in project management
4. **Assign work** (can be parallelized after Phase 1)
5. **Schedule deployment window** for staging validation
6. **Execute migration** following phases 1-5
7. **Monitor production** after deployment
8. **Retrospective** - what went well, what to improve

---

## References

- [Trace Event Types](../../services/events/src/types.ts)
- [Coordinator Operations](../../services/coordinator/src/operations/)
- [Dispatch Layer](../../services/coordinator/src/dispatch/)
- [SDK Trace Helpers](../../packages/sdk/src/trace.ts)
- [Events Service](../../services/events/)
