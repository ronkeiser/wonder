# Alarm-Based Dispatch for Breaking Subrequest Depth Limits

## Problem

Cloudflare Workers have a **16 subrequest depth limit**. When Durable Objects call each other synchronously, each call increments a depth counter. Deep nesting of recursive calls hits this limit:

```
Error: Subrequest depth limit exceeded. This request recursed through Workers too many times.
```

This is a fundamental problem for our architecture where deep nesting is the primary use case:

- Subworkflows invoking subworkflows
- Agents delegating to agents
- Agents invoking workflows that invoke agents

## Which Calls Are Recursive

Only calls that can form cycles or unbounded chains need this treatment:

| Call Pattern              | Recursive? | Reason                                                        |
| ------------------------- | ---------- | ------------------------------------------------------------- |
| Coordinator → Coordinator | Yes        | Subworkflow dispatch and result callbacks                     |
| Agent → Agent             | Yes        | Delegate mode                                                 |
| Agent → Coordinator       | Yes        | Agent-invoked workflows                                       |
| Coordinator → Agent       | Yes        | Workflow-invoked agents                                       |
| Coordinator → Executor    | No         | Executor is always a leaf (tasks don't call back recursively) |
| Agent → Executor          | No         | Same reason                                                   |
| Any → RESOURCES           | No         | Database operations are leaf calls                            |

## Solution: Alarm-Based Trampolining

The callee uses an alarm to break the synchronous call chain:

1. Caller invokes callee method
2. Callee persists the request to storage
3. Callee sets an immediate alarm on itself
4. Callee returns immediately (releasing the caller, breaking the depth chain)
5. Alarm fires as a fresh request (depth resets to 0)
6. Callee reads persisted request and executes the actual work

### Why Alarms Reset Depth

Cloudflare alarms fire as new invocations scheduled by the runtime, not as continuations of the original request. The `alarm()` handler starts with a fresh depth counter.

### Immediate Alarms

Cloudflare allows setting alarms to fire immediately:

```typescript
await this.ctx.storage.setAlarm(Date.now());
```

The alarm fires on the next tick, minimizing latency while still breaking the call chain.

## Implementation

### Data Structure: Pending Dispatches

Each DO that receives recursive calls maintains a pending dispatch queue:

```typescript
interface PendingDispatch {
  id: string;
  type: 'startSubworkflow' | 'handleSubworkflowResult' | 'handleAgentResult' | ...;
  payload: unknown;
  createdAt: number;
}
```

Stored under a well-known key prefix in DO storage:

```typescript
await this.ctx.storage.put(`pending:${dispatchId}`, dispatch);
```

### Callee Pattern (Coordinator Example)

```typescript
class WorkflowCoordinator extends DurableObject {
  // Called by parent coordinator or agent
  async startSubworkflow(params: SubworkflowParams): Promise<void> {
    // 1. Persist the request
    const dispatchId = crypto.randomUUID();
    await this.ctx.storage.put(`pending:${dispatchId}`, {
      id: dispatchId,
      type: 'startSubworkflow',
      payload: params,
      createdAt: Date.now(),
    });

    // 2. Set immediate alarm
    await this.ctx.storage.setAlarm(Date.now());

    // 3. Return immediately (caller is released, depth chain broken)
  }

  async handleSubworkflowResult(tokenId: string, output: unknown): Promise<void> {
    const dispatchId = crypto.randomUUID();
    await this.ctx.storage.put(`pending:${dispatchId}`, {
      id: dispatchId,
      type: 'handleSubworkflowResult',
      payload: { tokenId, output },
      createdAt: Date.now(),
    });
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    // Process all pending dispatches
    const pending = await this.ctx.storage.list<PendingDispatch>({ prefix: 'pending:' });

    for (const [key, dispatch] of pending) {
      try {
        await this.processDispatch(dispatch);
        await this.ctx.storage.delete(key);
      } catch (error) {
        // Handle error - could retry, log, or mark failed
        this.logger.error({ type: 'dispatch.failed', dispatch, error });
        await this.ctx.storage.delete(key);
      }
    }
  }

  private async processDispatch(dispatch: PendingDispatch): Promise<void> {
    switch (dispatch.type) {
      case 'startSubworkflow':
        await this.executeStartSubworkflow(dispatch.payload as SubworkflowParams);
        break;
      case 'handleSubworkflowResult':
        const { tokenId, output } = dispatch.payload as { tokenId: string; output: unknown };
        await this.executeHandleSubworkflowResult(tokenId, output);
        break;
      // ... other dispatch types
    }
  }
}
```

### Agent Pattern (Same Approach)

```typescript
class Conversation extends DurableObject {
  async startTurn(
    id: string,
    content: string,
    caller: Caller,
    options?: TurnOptions,
  ): Promise<void> {
    // If this could be a recursive call (e.g., delegate from another agent)
    if (caller.type === 'agent') {
      await this.ctx.storage.put(`pending:${crypto.randomUUID()}`, {
        type: 'startTurn',
        payload: { id, content, caller, options },
        createdAt: Date.now(),
      });
      await this.ctx.storage.setAlarm(Date.now());
      return;
    }

    // Non-recursive calls can proceed directly
    await this.executeStartTurn(id, content, caller, options);
  }

  async handleAgentResponse(turnId: string, toolCallId: string, response: string): Promise<void> {
    await this.ctx.storage.put(`pending:${crypto.randomUUID()}`, {
      type: 'handleAgentResponse',
      payload: { turnId, toolCallId, response },
      createdAt: Date.now(),
    });
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    // Same pattern as Coordinator
  }
}
```

## Calls to Modify

### Coordinator Service

| Method                      | Caller             | Action               |
| --------------------------- | ------------------ | -------------------- |
| `startSubworkflow()`        | Parent Coordinator | Trampoline via alarm |
| `handleSubworkflowResult()` | Child Coordinator  | Trampoline via alarm |
| `handleSubworkflowError()`  | Child Coordinator  | Trampoline via alarm |
| `handleAgentResult()`       | Agent DO           | Trampoline via alarm |

### Agent Service

| Method                           | Caller                  | Action               |
| -------------------------------- | ----------------------- | -------------------- |
| `startTurn()`                    | Parent Agent (delegate) | Trampoline via alarm |
| `handleAgentResponse()`          | Child Agent             | Trampoline via alarm |
| `handleWorkflowResult()`         | Coordinator             | Trampoline via alarm |
| `handleContextAssemblyResult()`  | Coordinator             | Trampoline via alarm |
| `handleMemoryExtractionResult()` | Coordinator             | Trampoline via alarm |

## Alarm Coalescing

Multiple pending dispatches can accumulate before the alarm fires. The alarm handler processes all of them in a single invocation, which is efficient. However, order matters:

- Process dispatches in `createdAt` order
- If processing one dispatch triggers another (same DO), it goes to storage and waits for the next alarm

## Error Handling

Failed dispatches should not block other dispatches. Options:

1. **Delete and log**: Remove failed dispatch, log error, continue
2. **Retry with backoff**: Keep dispatch, increment retry count, set future alarm
3. **Dead letter**: Move to a failed dispatches table for debugging

For now, option 1 is simplest. The caller's `waitUntil` will have already resolved, so there's no way to propagate errors back. Errors will surface through workflow/agent failure states.

## Comparison with Queue-Based Approach

| Aspect         | Alarm-Based               | Queue-Based               |
| -------------- | ------------------------- | ------------------------- |
| Infrastructure | None (built into DOs)     | Requires Cloudflare Queue |
| Latency        | ~0ms (immediate alarm)    | ~10-50ms                  |
| Durability     | DO storage (already used) | Queue storage             |
| Retry logic    | Manual                    | Built-in                  |
| Ordering       | Per-DO FIFO               | Queue-level FIFO          |
| Complexity     | Lower                     | Higher                    |
| Visibility     | DO storage inspection     | Queue metrics/dashboard   |

The alarm-based approach is simpler and doesn't require additional infrastructure. The queue-based approach may be better if we need cross-DO ordering guarantees or want built-in retry/DLQ functionality.

## Migration Steps

1. Add `PendingDispatch` type and storage helpers to shared types
2. Update Coordinator DO:
   - Add `pending:` storage operations
   - Modify `startSubworkflow`, `handleSubworkflowResult`, `handleSubworkflowError`, `handleAgentResult` to trampoline
   - Update `alarm()` to process pending dispatches (in addition to existing timeout checks)
3. Update Agent DO:
   - Same pattern for `startTurn` (when caller is agent), `handleAgentResponse`, `handleWorkflowResult`, etc.
4. Test with deep nesting scenarios:
   - 20+ level subworkflow chains
   - Agent → Workflow → Agent → Workflow chains
   - Agent delegation chains
