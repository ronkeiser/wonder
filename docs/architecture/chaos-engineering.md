# Chaos Engineering for Task Execution

## Problem

Steps exist to handle occasional failures—fetch, write, parse—and retry when there's a good chance of success on subsequent attempts. But these failure paths are difficult to test:

1. Real infrastructure failures are non-deterministic
2. Need to verify tasks restart from step 0, not just the failed step
3. Must observe state between retry attempts
4. Edge cases (timeout, partial success, corrupt output) rarely occur naturally

## Approach: Fault Injection Middleware

Wrap action dispatch with configurable fault injection. The middleware intercepts action execution and can fail, delay, or corrupt responses based on rules.

```
executeStep()
  └─ dispatchAction()
       └─ faultMiddleware.wrap()  ← injection point
            └─ actualHandler()
```

Handlers stay pure. Faults are orthogonal to business logic.

## Fault Types

| Type | Simulates | Use Case |
|------|-----------|----------|
| `fail_before` | Crash before action executes | Test idempotency—did we write before failing? |
| `fail_after` | Crash after success, before output mapping | "Did it happen?" uncertainty |
| `delay` | Slow action (near timeout) | Timeout handling, cascading delays |
| `intermittent` | Fails N times, then succeeds | Classic retry scenario |
| `permanent` | Always fails | Retry exhaustion, fallback paths |
| `corrupt_output` | Success but garbage data | Schema validation, defensive parsing |
| `partial_success` | Success but missing fields | Output mapping edge cases |
| `probability` | Random failure by percentage | Long-running chaos testing |

## Configuration

```typescript
interface FaultRule {
  id: string;
  
  // Targeting
  match: {
    action_id?: string | RegExp;
    action_kind?: ActionKind;
    step_ref?: string | RegExp;
    workflow_run_id?: string;
  };
  
  // Fault behavior
  fault: 
    | { type: 'fail_before' | 'fail_after'; error: string }
    | { type: 'delay'; ms: number }
    | { type: 'intermittent'; fail_count: number; error: string }
    | { type: 'permanent'; error: string }
    | { type: 'corrupt_output'; corruption: 'null' | 'empty' | 'wrong_type' | 'missing_fields' }
    | { type: 'probability'; chance: number; error: string };
  
  // Lifecycle
  enabled: boolean;
  max_injections?: number;  // Auto-disable after N faults
}

interface FaultInjectionConfig {
  rules: FaultRule[];
  global_enabled: boolean;
  log_injections: boolean;
}
```

## Observability

Middleware emits events for test assertions:

```typescript
interface FaultInjectionEvent {
  timestamp: number;
  rule_id: string;
  fault_type: string;
  target: { action_id: string; step_ref: string };
  attempt: number;
  outcome: 'injected' | 'skipped' | 'exhausted';
}
```

Test assertions:

```typescript
const events = faultMiddleware.getEvents();
expect(events.filter(e => e.outcome === 'injected')).toHaveLength(2);
expect(events[0].fault_type).toBe('intermittent');
```

## State Tracking for Intermittent Faults

Intermittent faults need state: "fail 2 times, succeed on attempt 3".

**Option: Use `payload.retry_attempt`**

The task payload already tracks retry count. Middleware can use this directly:

```typescript
if (fault.type === 'intermittent' && payload.retry_attempt >= fault.fail_count) {
  // Don't inject—we've failed enough
  return actualHandler(input, deps);
}
```

This is elegant because:
- No separate state tracking needed
- Naturally resets per task execution
- Aligns with actual retry semantics

## Key Test Assertions

Regardless of fault type, verify:

```typescript
// 1. Task retried from step 0 (full restart)
expect(stepExecutionLog).toEqual([
  // Attempt 1
  { step: 'write', success: true },
  { step: 'read', success: true },
  { step: 'verify', success: false },
  // Attempt 2 (all steps re-execute)
  { step: 'write', success: true },
  { step: 'read', success: true },
  { step: 'verify', success: true },
]);

// 2. Context reset between attempts
expect(attempt1Context.state).not.toBe(attempt2Context.state);

// 3. Retry count incremented
expect(finalPayload.retry_attempt).toBe(2);

// 4. Final output from successful attempt
expect(result.output).toEqual({ verified: true });
```

## Example: Testing write_file_verified

```typescript
const taskDef = {
  id: 'write_file_verified',
  steps: [
    { ref: 'write', action_id: 'write_file', on_failure: 'abort' },
    { ref: 'read', action_id: 'read_file', on_failure: 'abort' },
    { ref: 'verify', action_id: 'assert_match', on_failure: 'retry' }
  ],
  retry: { max_attempts: 3 }
};

const faultConfig = {
  rules: [{
    id: 'flaky_verify',
    match: { step_ref: 'verify' },
    fault: { type: 'intermittent', fail_count: 2, error: 'Content mismatch' },
    enabled: true
  }]
};

// Execute with fault injection
const result = await runTaskWithFaults(payload, taskDef, faultConfig);

// Assertions
expect(result.success).toBe(true);
expect(result.metrics.steps_executed).toBe(9); // 3 steps × 3 attempts
```

## Integration Options

### Test-Only (recommended for now)

Middleware lives in `@wonder/tests` or executor test utilities. Production code never imports it.

```typescript
// test/helpers/fault-injection.ts
export function withFaultInjection(
  runner: TaskRunner,
  config: FaultInjectionConfig
): TaskRunner
```

### Chaos Staging

For longer-running reliability testing in staging environments:

- Config stored in KV or environment
- Disabled by default, enabled via flag
- Probability-based faults for realistic chaos
- Events logged to Analytics Engine for analysis

### Never in Production

Fault injection should never be available in production. If staging chaos testing is implemented, use explicit environment checks:

```typescript
if (env.ENVIRONMENT === 'production') {
  throw new Error('Fault injection disabled in production');
}
```

## Implementation Priority

1. **Intermittent faults** - Most common retry scenario
2. **fail_after** - Tests "did it happen?" uncertainty
3. **corrupt_output** - Tests defensive parsing
4. **delay** - Tests timeout handling
5. **probability** - For chaos staging (later)

## Open Questions

- Should fault config be per-test or shared fixtures?
- How to test coordinator-side retry logic (dispatch → fail → redispatch)?
- Should faults be injectable at the coordinator dispatch level too?
