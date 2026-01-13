# Agent Service Refactor Recommendations

Code review findings for `/services/agent`.

---

## High Priority

### 1. `getTimedOut` ignores `'waiting'` operations

**File:** `src/operations/async.ts:376`

The comment says "pending or waiting ops can timeout" but the SQL only filters `status = 'pending'`. Operations marked as `'waiting'` (sync tools the turn is blocked on) will never timeout via alarm.

```typescript
// Current (broken)
eq(asyncOps.status, 'pending')

// Should be
inArray(asyncOps.status, ['pending', 'waiting'])
```

**Impact:** Sync tool calls that hang will block turns forever.

---

### 2. Missing `await` on async dispatch functions

**File:** `src/dispatch/apply.ts:206-207, 221-222`

```typescript
case 'DISPATCH_WORKFLOW': {
  dispatchWorkflow(decision, ctx);  // Missing await
  return {};
}

case 'DISPATCH_MEMORY_EXTRACTION': {
  dispatchMemoryExtraction(decision, ctx);  // Missing await
  return {};
}
```

Both `dispatchWorkflow` and `dispatchMemoryExtraction` are `async` functions that create workflow runs in D1 before dispatching. Without `await`, if D1 insertion fails, the error is silently swallowed and the operation appears to succeed.

**Fix:** Either:
- Add `await` and make `applyOne` async
- Or restructure to handle the promise properly (e.g., push to a promises array and `Promise.all` at the end)

---

### 3. `canRetry` / `prepareRetry` status mismatch

**File:** `src/operations/async.ts:412-420`

`canRetry()` checks `op.status !== 'failed'` and returns false. But the alarm handler calls this for timed-out operations which are still `'pending'` (or `'waiting'`). The retry path is effectively dead code for timeout scenarios.

```typescript
// canRetry returns false if not failed
if (op.status !== 'failed') return false;

// But alarm handler calls canRetry() on pending ops that timed out
const timedOutOps = this.asyncOps.getTimedOut(now);  // status = 'pending'
for (const op of timedOutOps) {
  const canRetry = this.asyncOps.canRetry(op.id);  // Always false!
```

**Fix:** `canRetry` should also allow `'pending'` status for timeout-triggered retries, or the alarm handler should mark the op as failed first.

---

## Medium Priority

### 4. Massive handler duplication (~300 lines)

**File:** `src/index.ts:712-1192`

These handlers are nearly identical:
- `handleTaskResult` / `handleTaskError`
- `handleWorkflowResult` / `handleWorkflowError`
- `handleAgentResponse` / `handleAgentError`

Each follows the same pattern:
1. Get turn, log, return if not found
2. Record result/error to moves
3. Notify WebSocket
4. Mark async op complete/failed
5. Check if was waiting
6. Either resume LLM loop or check turn completion

**Recommendation:** Extract to a single `handleOperationResult(turnId, toolCallId, result: ToolResult)` method. The six handlers become thin wrappers that construct the `ToolResult` and call the shared method.

---

### 5. Stale `hasWaiting` check logic

**File:** `src/index.ts:745, 829, 912, 994, 1073, 1155`

```typescript
const wasWaiting = this.asyncOps.hasWaiting(turnId);
```

This checks if *any* operation is waiting for the turn, not whether *this specific* operation was waiting. After `asyncOps.complete()` is called on the only waiting op, `hasWaiting` returns false.

The current code works by accident because:
- `complete()`/`fail()` is called before `hasWaiting()`
- If there was only one waiting op, it's now completed, so `hasWaiting` returns false
- But we want to know if *this* op was the one that was waiting

**Fix:** Either:
- Store the `wasWaiting` state before calling `complete()`/`fail()`
- Or have `complete()`/`fail()` return the previous status

---

### 6. Unsafe JSON field type assertions

**Files:** `src/index.ts:346, 357, 379, 506`

Multiple places cast JSON fields without validation:

```typescript
m.toolInput as Record<string, unknown>
m.toolResult as { success?: boolean } | null
turn?.input as { _agentCallback?: AgentCallback; ... }
```

If stored JSON doesn't match expected shape (data corruption, schema evolution), runtime errors occur.

**Recommendation:** Create type guard functions:

```typescript
function isAgentCallback(val: unknown): val is AgentCallback {
  return val !== null && typeof val === 'object'
    && 'conversationId' in val && 'turnId' in val && 'toolCallId' in val;
}
```

---

## Low Priority

### 7. Sequential tool insertions

**File:** `src/operations/defs.ts:198-200`

```typescript
for (const tool of tools) {
  this.db.insert(toolDefs).values(tool).run();
}
```

Could batch insert for better performance with many tools:

```typescript
if (tools.length > 0) {
  this.db.insert(toolDefs).values(tools).run();
}
```

---

### 8. Multiple DB queries for cached data

**File:** `src/index.ts:333-335`

```typescript
const persona = this.defs.getPersona();
const agent = this.defs.getAgent();
const moves = this.moves.getForTurn(turnId);
```

`persona` and `agent` don't change during DO lifetime. Consider caching at instance level after first fetch instead of querying SQLite each time.

---

### 9. Non-null assertions in `reconstructCaller`

**File:** `src/operations/turns.ts:312-316`

```typescript
case 'user':
  return { type: 'user', userId: turn.callerUserId! };
```

Uses `!` assertions. If data integrity is violated, this crashes without helpful error.

**Fix:** Add defensive checks:

```typescript
case 'user':
  if (!turn.callerUserId) throw new Error(`Turn ${turn.id} missing callerUserId`);
  return { type: 'user', userId: turn.callerUserId };
```

---

### 10. Unused `raw` field in moves schema

**File:** `src/schema/index.ts:175`

The `raw` field is documented as "Debug" but never written to. Either use it or remove it.

---

### 11. Magic error code strings

Error codes like `'CONTEXT_ASSEMBLY_FAILED'`, `'EXECUTION_FAILED'`, `'AGENT_DECLINED'` are scattered as string literals. The `ToolErrorCode` type exists but `TurnError.code` uses different literals.

**Recommendation:** Unify error codes into a single enum/const object and use it consistently.

---

## Summary

| Priority | Issue | Effort |
|----------|-------|--------|
| High | `getTimedOut` ignores waiting ops | 5 min |
| High | Missing `await` on async dispatches | 15 min |
| High | `canRetry` status mismatch | 10 min |
| Medium | Handler duplication | 1 hr |
| Medium | Stale `hasWaiting` check | 20 min |
| Medium | Unsafe JSON casts | 30 min |
| Low | Sequential tool inserts | 5 min |
| Low | Cache persona/agent | 15 min |
| Low | Non-null assertions | 10 min |
| Low | Unused raw field | 5 min |
| Low | Magic error strings | 20 min |