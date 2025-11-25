# Error Handling

## Error Categories

**Infrastructure errors** (transient, retryable):

- Network timeouts
- Rate limits (429)
- Provider unavailable (503)

**Business errors** (permanent, workflow-level):

- Invalid input schema
- LLM refusal
- MCP tool not found
- Human input timeout

## Retry Policy

Defined in `ActionDef.execution.retry_policy`:

```typescript
{
  max_attempts: number         // total tries (1 = no retry)
  backoff: 'exponential'       // 'none' | 'linear' | 'exponential'
  initial_delay_ms: number     // starting delay
  max_delay_ms?: number        // cap for exponential backoff
  retryable_errors?: string[]  // error codes to retry (e.g., ['TIMEOUT', 'RATE_LIMIT'])
}
```

- Retries happen at Worker/task level, invisible to DO
- Success after retry = normal result, retry count logged
- Failure after retries exhausted = `WorkflowTaskResult.status: 'failure'`

## Timeout Enforcement

- `ActionDef.execution.timeout_ms` enforced by Worker
- Timeout = immediate failure (counts as one attempt)
- Default timeout if not specified: 5 minutes

## Failure Routing

When task fails after retries:

- Worker returns `WorkflowTaskResult` with `error: { code, message, retryable: false }`
- DO writes error to context (e.g., `state._last_error = { code, message, node_id }`)
- Transitions can match on error presence or code:
  ```typescript
  condition: {
    type: 'exists',
    field: { type: 'field', path: 'state._last_error' }
  }
  ```
- No matching transition = workflow fails, status = `failed`

## Human Input Timeout

- `HumanInputImpl.timeout_ms` starts when node executes
- Warning emitted at 75% of timeout (via event)
- Timeout expiry = task failure, routes via failure transitions
- No timeout = waits indefinitely (status = `waiting`)

## Sub-workflow Failures

- `WorkflowCallImpl.on_failure: 'propagate'` (default): sub-workflow error fails parent node
- `WorkflowCallImpl.on_failure: 'catch'`: sub-workflow error writes to output, parent continues
- Caught errors available in `output.error: { workflow_run_id, message }`

## Workflow Recovery

After infrastructure failure (DO eviction, crash):

- Reload `WorkflowRun` from D1
- Load latest snapshot
- Replay events from `after_sequence_number + 1`
- Resume token execution from last known state
- In-flight tasks may complete after recovery (idempotency keys prevent duplication)
