# Capability 5: Error Handling & Retries

## Goal

Implement robust error handling with automatic retries, timeout enforcement, and failure routing to make workflows production-ready.

## Why This Matters

LLM APIs are unreliable (rate limits, transient 503s), external APIs fail, timeouts happen. Production workflows must handle failures gracefully: retry transient errors, route around permanent failures, surface issues for human intervention.

## Current State (After Capability 4)

✅ Multiple action types working  
✅ Multi-node execution with parallelism  
✅ Basic error propagation (tasks fail → workflow fails)  
❌ No automatic retries  
❌ No timeout enforcement  
❌ No failure routing  
❌ Limited error context

## What We're Building

### 1. Retry Policies

Define retry behavior per action:

```typescript
{
  kind: 'llm_call',
  implementation: { ... },
  execution: {
    timeout_ms: 30000,
    retry_policy: {
      max_attempts: 3,
      backoff: 'exponential',
      initial_delay_ms: 1000,
      max_delay_ms: 10000,
      retryable_errors: ['503', '429', 'TIMEOUT', 'NETWORK_ERROR']
    }
  }
}
```

**Backoff Strategies:**

- `none`: Retry immediately
- `linear`: 1s, 2s, 3s, ...
- `exponential`: 1s, 2s, 4s, 8s, ... (capped at max_delay_ms)

**Retryable Error Codes:**

- `503` - Service Unavailable
- `429` - Rate Limit
- `500` - Internal Server Error
- `TIMEOUT` - Request timeout
- `NETWORK_ERROR` - Connection failed

### 2. Timeout Enforcement

Worker enforces timeouts per action:

```typescript
async function executeWithTimeout(action, timeout_ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const result = await executeAction(action, { signal: controller.signal });
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new TimeoutError(`Action timed out after ${timeout_ms}ms`);
    }
    throw err;
  }
}
```

### 3. Failure Transitions

Route on error state:

```typescript
// After node fails, set error in context
context.state._last_error = {
  code: 'LLM_RATE_LIMIT',
  message: '429 Too Many Requests',
  retryable: true,
  node_id: 'llm_call_node',
  timestamp: '2024-...'
};

// Transition can match on error
{
  from_node_id: 'llm_call_node',
  to_node_id: 'fallback_node',
  priority: 1,
  condition: {
    type: 'exists',
    field: { type: 'field', path: 'state._last_error' }
  }
}
```

### 4. Error Classification

Distinguish error types:

**Retryable (Transient):**

- Rate limits (429)
- Service unavailable (503)
- Network timeouts
- Temporary outages

**Non-retryable (Permanent):**

- Invalid input (400)
- Authentication failed (401)
- Not found (404)
- Validation errors
- Schema mismatches

**Infrastructure:**

- Queue failures
- DO errors
- Database errors
  → Handled at platform level, invisible to workflow

## Architecture

### New Components

**`RetryExecutor`** (`execution/retry.ts`)

- Wrap action execution with retry logic
- Implement backoff strategies
- Track attempt count
- Classify errors as retryable/non-retryable

**`ErrorContext`** (type in `execution/definitions.ts`)

```typescript
type ErrorContext = {
  code: string;
  message: string;
  retryable: boolean;
  node_id: string;
  action_id: string;
  timestamp: string;
  attempt: number;
  stack_trace?: string;
};
```

### Modified Components

**`domains/execution/worker.ts`**

- Wrap execution with `RetryExecutor`
- Enforce timeout via AbortController
- Classify errors
- Return detailed error in `WorkflowTaskResult`

**`domains/coordination/results.ts`**

- Capture error context from failed tasks
- Write `_last_error` to context state
- Evaluate transitions (may route to error handler)
- Emit `node_failed` event with error details

**`TransitionEvaluator`**

- Support matching on `_last_error` presence/values
- Clear `_last_error` after successful node

## Data Flow

### Retry Flow

```
Worker receives task
  ↓
Attempt 1: Execute action
  ↓
Error (503)
  ↓
Is retryable? YES
  ↓
Attempt < max_attempts? YES
  ↓
Wait (backoff delay)
  ↓
Attempt 2: Execute action
  ↓
Error (503)
  ↓
Wait (exponential backoff)
  ↓
Attempt 3: Execute action
  ↓
Success → Return result
```

### Failure Routing Flow

```
Worker exhausts retries
  ↓
Return WorkflowTaskResult with status='failure'
  ↓
DO receives failure
  ↓
Write error to context.state._last_error
  ↓
Emit node_failed event
  ↓
Evaluate transitions from failed node
  ↓
Match on error condition?
  ↓ YES                    ↓ NO
Route to error handler    Workflow fails
```

## Test Scenarios

### Test 1: Automatic Retry Success

```
[Node A: Flaky LLM Call]
  Retry policy: 3 attempts, exponential backoff

Execution:
  - Attempt 1: 503 (wait 1s)
  - Attempt 2: 503 (wait 2s)
  - Attempt 3: Success
```

**Verify:**

- 3 attempts executed
- Backoff delays applied
- Final success propagated
- No error in context
- Node completed normally

### Test 2: Retry Exhaustion

```
[Node A: Broken LLM Call]
  Retry policy: 3 attempts

Execution:
  - Attempt 1: 503
  - Attempt 2: 503
  - Attempt 3: 503
  - Give up
```

**Verify:**

- All 3 attempts executed
- Error returned to DO
- `state._last_error` populated
- `node_failed` event emitted

### Test 3: Failure Routing

```
[Node A: LLM Call with Error Handling]
  Retry policy: 2 attempts

→ Transition 1 (priority 1):
    condition: NOT exists(state._last_error)
    to: Node B (Success Path)

→ Transition 2 (priority 2):
    condition: exists(state._last_error)
    to: Node C (Error Handler)

[Node C: Error Handler]
  Send notification or fallback action
```

**Verify:**

- Error detected after retries
- Transition 2 matches
- Node C executes
- Error context available for handling

### Test 4: Timeout Enforcement

```
[Node A: Slow HTTP Request]
  Timeout: 5000ms
  Actual duration: 10000ms
```

**Verify:**

- Request aborted at 5s
- TimeoutError thrown
- Retry if configured
- Error context includes TIMEOUT code

### Test 5: Non-retryable Error

```
[Node A: LLM Call with Bad Input]
  Error: 400 Bad Request (validation error)
```

**Verify:**

- No retry attempted (non-retryable)
- Immediate failure
- Error context shows non-retryable
- Workflow can route to error handler

## Implementation Checklist

### Phase 1: Retry Logic (~100 LOC)

- [ ] Create `RetryExecutor`
- [ ] Implement backoff strategies (none, linear, exponential)
- [ ] Implement retry loop with attempt tracking
- [ ] Classify errors as retryable/non-retryable
- [ ] Unit test: successful retry, exhaustion, backoff timing

### Phase 2: Timeout Enforcement (~40 LOC)

- [ ] Implement timeout wrapper with AbortController
- [ ] Integrate with action executors
- [ ] Handle AbortError → TimeoutError
- [ ] Unit test: timeout scenarios

### Phase 3: Error Context (~50 LOC)

- [ ] Define `ErrorContext` type
- [ ] Capture error details in worker
- [ ] Include in `WorkflowTaskResult`
- [ ] Unit test: error serialization

### Phase 4: Worker Integration (~60 LOC)

- [ ] Wrap action execution with RetryExecutor
- [ ] Apply timeout enforcement
- [ ] Return detailed errors
- [ ] Unit test: integrated retry + timeout

### Phase 5: DO Error Handling (~70 LOC)

- [ ] Write `_last_error` to context on failure
- [ ] Emit `node_failed` events
- [ ] Support error-based transition matching
- [ ] Clear `_last_error` after successful nodes
- [ ] Unit test: error context propagation

### Phase 6: E2E Tests (~150 LOC)

- [ ] Retry success test (flaky LLM)
- [ ] Retry exhaustion test
- [ ] Failure routing test
- [ ] Timeout enforcement test
- [ ] Non-retryable error test
- [ ] Verify event sequences
- [ ] Verify error context availability

## Effort Estimate

**~350 LOC total**  
**4-5 days** (including testing)

## Success Criteria

✅ Automatic retries work with configurable backoff  
✅ Timeouts enforced correctly  
✅ Error classification (retryable vs non-retryable)  
✅ Failure transitions route on error state  
✅ Error context captured and propagated  
✅ E2E tests pass for all scenarios  
✅ No infinite retry loops  
✅ Production-ready error handling

## Edge Cases to Handle

- Retry during fan-out (isolated per branch)
- Timeout during slow LLM streaming
- Error in error handler node (prevent recursion)
- Rate limit headers (429 with Retry-After)
- Partial success in parallel execution
- DO/Queue infrastructure errors (separate from workflow errors)
- Error message sanitization (no secrets leaked)

## Observability

**Events:**

- Include retry attempt count in `node_started`
- Include error details in `node_failed`
- Track retry duration separately

**Metrics:**

- Retry rate by action type
- Error rate by error code
- Timeout frequency
- Average attempts until success

**Context:**

- `_last_error` visible in run inspector
- Retry history in event log
- Error classification shown in UI

## Future Extensions (Deferred)

- Circuit breaker pattern (fail fast after N consecutive errors)
- Dead letter queue for permanently failed tasks
- Custom error handlers per error code
- Error aggregation across parallel branches
- Alerting on error thresholds
- Error budget tracking
- Automatic rollback on failure
- Compensation workflows (saga pattern)
