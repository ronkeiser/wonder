# Service Gateway Pattern

## Problem

Cloudflare Workers have a subrequest depth limit of 16. When Workers or Durable Objects call other Workers/DOs in a chain, each hop consumes depth. The depth counter only resets on fresh HTTP requests or queue consumption—not on `waitUntil`.

Wonder's architecture requires arbitrary orchestration depth: workflows with hundreds of nodes, agents invoking agents, workflows invoking subworkflows. The current pattern of direct cross-service DO calls makes this impossible.

### Current Failure

Test 08 (conversation with context assembly) fails with:

```
D1_ERROR: Subrequest depth limit exceeded. This request recursed through Workers too many times.
```

The call chain:
1. HTTP → Agent DO (startTurn)
2. Agent DO → RESOURCES (4 calls for initialization)
3. Agent DO → RESOURCES (create workflow run)
4. Agent DO → Coordinator DO (start)
5. Coordinator DO → RESOURCES (get workflow run)
6. RESOURCES → D1 ← **fails here**

By contrast, workflow tests pass because the Coordinator dispatches to the Executor (a Worker, not a DO), which resets the depth when it calls back.

## Solution

**Every service becomes a gateway to its DOs. No cross-service DO-to-DO calls.**

Instead of:
```
Agent DO → env.COORDINATOR.idFromName(id).get() → Coordinator DO
```

Do:
```
Agent DO → env.COORDINATOR_SERVICE.startWorkflow(id, ...) → Coordinator Worker → Coordinator DO
```

The Worker in the middle is a fresh invocation. Depth resets to 0.

## Current Cross-Service DO Bindings

| Service | Binds to DO | Target Service |
|---------|-------------|----------------|
| agent | COORDINATOR (WorkflowCoordinator) | wonder-coordinator |
| agent | STREAMER (Streamer) | wonder-events |
| coordinator | AGENT (Conversation) | wonder-agent |
| coordinator | STREAMER (Streamer) | wonder-events |
| executor | COORDINATOR (WorkflowCoordinator) | wonder-coordinator |
| executor | AGENT (Conversation) | wonder-agent |
| executor | STREAMER (Streamer) | wonder-events |
| http | COORDINATOR (WorkflowCoordinator) | wonder-coordinator |
| http | CONVERSATION (Conversation) | wonder-agent |
| http | EVENTS_STREAMER, BROADCASTER | wonder-events |
| http | LOGS_STREAMER | wonder-logs |
| resources | BROADCASTER | wonder-events |

All of these need to become service bindings with the target service exposing RPC methods (or fetch handlers for WebSocket/SSE).

## Changes Required

### 1. Agent Service (wonder-agent)

**Expose:**
- `startTurn(conversationId, content, sender, options)` - RPC method
- `handleTaskResult(turnId, toolCallId, result)` - RPC method (called by Executor)
- `handleContextAssemblyResult(...)` - RPC method (called by Coordinator)
- `handleMemoryExtractionResult(...)` - RPC method (called by Coordinator)
- `fetch()` handler for WebSocket upgrades (chat endpoint)

**Change to use service bindings:**
- `COORDINATOR` DO binding → `COORDINATOR` service binding
- `STREAMER` DO binding → `EVENTS` service binding

### 2. Coordinator Service (wonder-coordinator)

**Expose:**
- `start(workflowRunId)` - RPC method
- `startSubworkflow(params)` - RPC method
- `handleTaskResult(tokenId, result)` - RPC method (called by Executor)
- `handleTaskError(tokenId, error)` - RPC method (called by Executor)
- `handleSubworkflowResult(...)` - RPC method (called by child Coordinator)
- `markTokenExecuting(tokenId)` - RPC method (called by Executor)

**Change to use service bindings:**
- `AGENT` DO binding → `AGENT` service binding
- `STREAMER` DO binding → `EVENTS` service binding

### 3. Executor Service (wonder-executor)

Already a Worker with RPC methods.

**Change to use service bindings:**
- `COORDINATOR` DO binding → `COORDINATOR` service binding
- `AGENT` DO binding → `AGENT` service binding
- `STREAMER` DO binding → `EVENTS` service binding

### 4. Events Service (wonder-events)

**Expose:**
- `emit(event)` - RPC method for Streamer
- `broadcast(channel, event)` - RPC method for Broadcaster
- `fetch()` handler for SSE streams and WebSocket connections

### 5. HTTP Service (wonder-http)

**Change to use service bindings:**
- `COORDINATOR` DO binding → `COORDINATOR` service binding
- `CONVERSATION` DO binding → `AGENT` service binding
- `EVENTS_STREAMER`, `BROADCASTER` DO bindings → `EVENTS` service binding
- `LOGS_STREAMER` DO binding → `LOGS` service binding

HTTP will call service RPC methods or proxy HTTP requests (for WebSocket/SSE) to the internal services.

### 6. Resources Service (wonder-resources)

**Change to use service bindings:**
- `BROADCASTER` DO binding → `EVENTS` service binding

### 7. Logs Service (wonder-logs)

**Expose:**
- `fetch()` handler for log streaming (if needed by HTTP)

## Implementation Pattern

Each service Worker routes to its DOs internally:

```typescript
// coordinator service
export default class CoordinatorService extends WorkerEntrypoint<Env> {
  async start(workflowRunId: string): Promise<void> {
    const id = this.env.COORDINATOR.idFromName(workflowRunId);
    const coordinator = this.env.COORDINATOR.get(id);
    return coordinator.start(workflowRunId);
  }

  async handleTaskResult(workflowRunId: string, tokenId: string, result: TaskResult): Promise<void> {
    const id = this.env.COORDINATOR.idFromName(workflowRunId);
    const coordinator = this.env.COORDINATOR.get(id);
    return coordinator.handleTaskResult(tokenId, result);
  }
}
```

For WebSocket/SSE, the service exposes a fetch handler:

```typescript
// events service
export default class EventsService extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const streamId = url.searchParams.get('streamId');

    const id = this.env.STREAMER.idFromName(streamId);
    const streamer = this.env.STREAMER.get(id);
    return streamer.fetch(request);
  }
}
```

## Wrangler Config Changes

Before:
```jsonc
// agent/wrangler.jsonc
"durable_objects": {
  "bindings": [
    { "name": "COORDINATOR", "class_name": "WorkflowCoordinator", "script_name": "wonder-coordinator" }
  ]
}
```

After:
```jsonc
// agent/wrangler.jsonc
"services": [
  { "binding": "COORDINATOR", "service": "wonder-coordinator" }
]
```

## Benefits

1. **Unlimited orchestration depth** - Each service call resets the depth counter
2. **Clear service boundaries** - DOs are internal implementation details
3. **Consistent pattern** - All cross-service communication goes through service bindings
4. **No public exposure** - Services with `workers_dev: false` and no routes remain internal

## Migration Order

1. Events service - Add RPC methods and fetch handler for streaming
2. Coordinator service - Add RPC methods (already has the DO methods, just need service wrappers)
3. Agent service - Add RPC methods and fetch handler for WebSocket
4. Update Executor to use service bindings
5. Update HTTP to use service bindings
6. Update Resources to use service binding for events
7. Update Agent to use service bindings
8. Update Coordinator to use service bindings
9. Remove all cross-service DO bindings from wrangler configs