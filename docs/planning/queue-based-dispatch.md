# Queue-Based Dispatch for Breaking Depth Limits

## Problem

Cloudflare Workers have a **16 invocation depth limit**. Each Worker or DO call in a chain increments a counter tracked via the `CF-EW-Via` header. When this counter reaches 16, subsequent calls fail with:

```
D1_ERROR: Subrequest depth limit exceeded. This request recursed through Workers too many times.
```

### What We Tried (Service Gateway Pattern)

We implemented WorkerEntrypoint classes (CoordinatorService, AgentService) to wrap DO access, hoping service binding calls would reset the depth counter. **This assumption was wrong.** Service bindings do not reset depth—they're still counted against the 16-invocation limit.

### Why Workflow Tests Pass

Workflow tests work because:
1. HTTP → CoordinatorService → Coordinator DO (depth ~3)
2. Coordinator DO → ExecutorService.executeTask() (depth ~4)
3. Executor completes, then **callbacks happen on a fresh invocation**

The Executor is fire-and-forget. When it calls back to Coordinator with results, that's a new request chain starting at depth 0.

### Why Conversation Tests Fail

Conversation tests fail because:
1. HTTP → AgentService → Agent DO (depth ~2)
2. Agent DO initializes: 4 RESOURCES calls (depth ~6)
3. Agent DO → RESOURCES.workflowRuns().create() (depth ~7)
4. Agent DO → CoordinatorService.start() (depth ~8)
5. CoordinatorService → Coordinator DO (depth ~9)
6. Coordinator DO → RESOURCES.workflowRuns().get() (depth ~10)
7. RESOURCES → D1 (depth ~11) — **fails somewhere around here**

The entire chain is synchronous. No depth reset ever happens.

## Solution: Cloudflare Queues

Cloudflare Queues provide a `queue(batch, env, ctx)` handler that runs as a **fresh invocation** with depth reset to 0. This is the only way to break long call chains.

### When to Use Queues

**Use a queue when a DO needs to trigger work in another DO that will make external calls.**

| Call Pattern | Use Queue? | Reason |
|--------------|------------|--------|
| HTTP → DO | No | Fresh invocation from HTTP |
| DO → stateless Worker | No | Worker callbacks are fresh |
| DO → RESOURCES (simple read) | No | Low depth, acceptable |
| DO → another service's DO | **Yes** | Cross-service DO chains accumulate depth |
| DO → DO that will call D1/KV | **Yes** | Target DO needs depth headroom |

### Specific Calls That Need Queues

1. **Agent DO → Coordinator.start()** — Agent triggers workflow execution
2. **Coordinator DO → Agent callbacks** — Workflow results back to agent
3. **Agent DO → Agent DO** — Agent delegation
4. **Coordinator DO → Coordinator DO** — Subworkflow callbacks

## Implementation Plan

### Phase 1: Create a Shared Queue

One queue can handle all dispatch types. Message structure:

```typescript
type QueueMessage =
  | { type: 'coordinator.start'; workflowRunId: string; options?: { enableTraceEvents?: boolean } }
  | { type: 'coordinator.handleSubworkflowResult'; workflowRunId: string; tokenId: string; result: unknown }
  | { type: 'agent.handleContextAssemblyResult'; conversationId: string; turnId: string; runId: string; context: unknown }
  | { type: 'agent.handleWorkflowResult'; conversationId: string; turnId: string; toolCallId: string; result: unknown }
  | { type: 'agent.startTurn'; conversationId: string; input: unknown; caller: unknown; options?: unknown };
```

### Phase 2: Queue Producer (Agent/Coordinator)

Replace direct service binding calls with queue sends:

```typescript
// Before (fails with depth limit)
await ctx.coordinator.start(workflowRunId);

// After (breaks depth chain)
await ctx.env.DISPATCH_QUEUE.send({
  type: 'coordinator.start',
  workflowRunId,
  options: { enableTraceEvents: true },
});
```

### Phase 3: Queue Consumer

A single Worker consumes the queue and routes to appropriate services:

```typescript
export default {
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await routeMessage(message.body, env);
        message.ack();
      } catch (error) {
        message.retry();
      }
    }
  },
};

async function routeMessage(msg: QueueMessage, env: Env): Promise<void> {
  switch (msg.type) {
    case 'coordinator.start':
      await env.COORDINATOR.start(msg.workflowRunId, msg.options);
      break;
    case 'agent.handleContextAssemblyResult':
      await env.AGENT.handleContextAssemblyResult(
        msg.conversationId,
        msg.turnId,
        msg.runId,
        msg.context
      );
      break;
    // ... other cases
  }
}
```

### Phase 4: Wrangler Configuration

```jsonc
// services/dispatch/wrangler.jsonc (new service)
{
  "name": "wonder-dispatch",
  "main": "src/index.ts",
  "queues": {
    "consumers": [
      { "queue": "wonder-dispatch", "max_batch_size": 10, "max_retries": 3 }
    ]
  },
  "services": [
    { "binding": "COORDINATOR", "service": "wonder-coordinator", "entrypoint": "CoordinatorService" },
    { "binding": "AGENT", "service": "wonder-agent", "entrypoint": "AgentService" }
  ]
}
```

Producer services need the queue binding:

```jsonc
// services/agent/wrangler.jsonc
{
  "queues": {
    "producers": [
      { "binding": "DISPATCH_QUEUE", "queue": "wonder-dispatch" }
    ]
  }
}
```

## What We Keep From Current Changes

The WorkerEntrypoint classes (CoordinatorService, AgentService) are still valuable:
- Clean RPC interface for cross-service calls
- Type safety via service bindings with entrypoints
- Queue consumer uses them to route messages

The service binding changes in wrangler configs are also good:
- HTTP no longer has cross-service DO bindings
- Proper entrypoint declarations for typing

## Migration Steps

1. Create `services/dispatch` with queue consumer
2. Add queue bindings to `wrangler.jsonc` files
3. Create the queue in Cloudflare dashboard or via wrangler
4. Update Agent DO to use queue for `coordinator.start()`
5. Update Coordinator DO to use queue for agent callbacks
6. Deploy and test
7. Remove any remaining direct cross-service DO calls

## Tradeoffs

**Pros:**
- Breaks depth limit, enabling unlimited orchestration
- Queue provides automatic retries
- Messages are durable (survives Worker restarts)

**Cons:**
- Added latency (~10-50ms per queue hop)
- Eventual consistency (caller doesn't wait for result)
- More infrastructure to manage

The latency is acceptable because these calls are already fire-and-forget with `waitUntil`. We're not waiting for results inline—we're dispatching work and receiving callbacks later.
