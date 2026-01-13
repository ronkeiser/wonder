# Agent Implementation Plan - Phase 4

## Status

**Completed (Phases 1-3):**
- ✅ LLM Integration (`callLLM`, `callLLMWithStreaming`)
- ✅ Coordinator → Agent Callbacks (`handleWorkflowResult`, `handleWorkflowError`)
- ✅ Memory Extraction Callback (`handleMemoryExtractionResult`)
- ✅ Sync Tool Continuation (`buildContinuationRequest` with `rawContent`)
- ✅ Agent-to-Agent Callbacks (delegate mode with `_agentCallback`)
- ✅ WebSocket Streaming (`fetch()` upgrade, `streamToken` callback)
- ✅ `handleTaskError()` - Task failures surfaced to LLM
- ✅ `handleAgentError()` - Agent delegation failures
- ✅ Turn issues tracking (`toolFailures`, `memoryExtractionFailed`)
- ✅ `startAgentCall()` - Workflow-initiated agent calls
- ✅ `alarm()` - Timeout handling with DO alarms
- ✅ Active turns in context assembly
- ✅ Tool retry configuration (schema + tracking)
- ✅ Loop-in invocation mode with participants table

**Phase 4:** Six gaps remain between spec and implementation.

---

## Gap Analysis

| # | Feature | Spec Lines | Impact |
|---|---------|------------|--------|
| 1 | Memory Workflow Contracts | 926-958 | Context assembly/extraction have incomplete inputs |
| 2 | Shell Operations & Branch Context | 875-923 | Agents can't execute shell commands |
| 3 | WebSocket Connection Handling | 962-968 | No proper WebSocket upgrade/routing |
| 4 | Retry Logic Execution | 1077-1102 | Retries tracked but not executed |
| 5 | Input Validation | 137 | Tool inputs not validated against schema |
| 6 | D1 Persistence for Observability | 325-327 | Turns/messages only in DO SQLite |

---

## 1. Memory Workflow Contracts

**Problem:** Context assembly and memory extraction workflows receive incomplete inputs. The spec defines specific contracts.

### Context Assembly Input (spec lines 930-937)

**Current:** `ContextAssemblyInput` has basic fields but missing `tool_definitions`.

**Required input:**
```typescript
type ContextAssemblyInput = {
  conversationId: string;
  userMessage: string;
  recentTurns: TurnSnapshot[];
  modelProfileId: string;      // ✅ Have this
  toolIds: string[];           // ✅ Have this
  activeTurns?: ActiveTurnInfo[]; // ✅ Have this
  toolDefinitions: ToolDefinition[]; // ❌ Missing - resolved tools for the persona
};
```

**Required output:**
- Provider-native LLM request (Anthropic messages format, OpenAI chat completion format, etc.)

### Memory Extraction Input (spec lines 951-957)

**Current:** `MemoryExtractionInput` exists but is minimal.

**Required input:**
```typescript
type MemoryExtractionInput = {
  agentId: string;
  turnId: string;
  transcript: MoveSnapshot[];  // ✅ Have this
  // The workflow receives this and uses memory.* actions to write
};
```

**Files to modify:**
- [services/agent/src/types.ts](services/agent/src/types.ts) - Add `toolDefinitions` to `ContextAssemblyInput`
- [services/agent/src/loop.ts](services/agent/src/loop.ts) - Resolve and include tool definitions

**Implementation:**
```typescript
// In dispatchContextAssembly:
const toolDefs = defs.getTools();
const toolDefinitions = toolDefs.map(def => ({
  id: def.id,
  name: def.name,
  description: def.description,
  inputSchema: def.inputSchema,
  targetType: def.targetType,
  async: def.async,
}));

const input: ContextAssemblyInput = {
  // ... existing fields
  toolDefinitions,
};
```

---

## 2. Shell Operations & Branch Context

**Problem:** Agents can't execute shell commands. No branch context for conversations.

### Conversation Branch (spec lines 879-889)

At conversation start, create a working branch:
```
Conversation created for agent scoped to project P
  → Branch: wonder/conv-{conversation_id} from project's default branch
  → Stored in conversation context
```

### Branch Context in Tool Execution (spec lines 891-901)

When a tool invokes a task with shell actions:
1. ConversationRunner dispatches to Executor with conversation context (conv_id, repo_id, branch)
2. Executor gets the conversation's ContainerHost (keyed by conv_id)
3. Command executes on the conversation's branch

### Workflow-Initiated Agent Calls (spec lines 915-923)

When a workflow node invokes an agent:
- The agent receives the parent workflow's branch context in input
- Shell operations use that branch
- No new branch is created

**Files to modify:**
- [services/agent/src/schema/index.ts](services/agent/src/schema/index.ts) - Add `branchContext` to `conversationMeta`
- [services/agent/src/types.ts](services/agent/src/types.ts) - Add `BranchContext` type
- [services/agent/src/index.ts](services/agent/src/index.ts) - Initialize branch on conversation start
- [services/agent/src/dispatch/apply.ts](services/agent/src/dispatch/apply.ts) - Pass branch context to Executor

**Implementation:**

```typescript
// types.ts
type BranchContext = {
  repoId: string;
  branch: string;
};

// In conversationMeta schema
branchContext: text({ mode: 'json' }).$type<BranchContext>(),

// In startTurn - create branch if not exists
if (!conversation.branchContext) {
  const branch = `wonder/conv-${conversationId}`;
  // Create branch via resources
  await ctx.resources.repos().createBranch(repoId, branch);
  // Store in conversation meta
  this.defs.updateConversation({ branchContext: { repoId, branch } });
}

// In dispatchTask - pass branch context
ctx.executor.executeTaskForAgent({
  // ... existing fields
  branchContext: conversation.branchContext,
});
```

---

## 3. WebSocket Connection Handling

**Problem:** WebSocket upgrade in `fetch()` is incomplete. No proper routing or async interleaving.

### Current State
- `fetch()` exists but WebSocket handling is basic
- No `/conversations/:id` routing pattern
- No async message interleaving

### Required (spec lines 962-968)
- Browser clients connect to `/conversations/:id`, upgrades to WebSocket
- ConversationRunner calls LLM provider directly and streams tokens
- Per-message streaming: each agent message streams independently
- Async interleaving: results appear as new messages even during active stream

**Files to modify:**
- [services/agent/src/index.ts](services/agent/src/index.ts) - Enhance `fetch()` for proper WebSocket handling
- [services/agent/src/streaming/websocket.ts](services/agent/src/streaming/websocket.ts) - Message queue for async interleaving

**Implementation:**

```typescript
// In fetch():
async fetch(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // WebSocket upgrade
  if (request.headers.get('Upgrade') === 'websocket') {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.activeWebSocket = server;

    // Message queue for async interleaving
    this.messageQueue = [];

    server.addEventListener('message', async (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === 'message') {
        await this.startTurn(/* ... */);
      }
    });

    server.addEventListener('close', () => {
      this.activeWebSocket = null;
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // HTTP RPC handling
  // ...
}

// Async interleaving - when async result arrives during stream:
private sendMessage(message: { type: string; content: unknown }) {
  if (this.activeWebSocket?.readyState === WebSocket.OPEN) {
    this.activeWebSocket.send(JSON.stringify(message));
  }
}
```

---

## 4. Retry Logic Execution

**Problem:** Retry configuration is tracked in `async_ops` but never executed. When a tool fails with `retriable: true`, we should actually retry.

### Current State
- `asyncOps` has `attemptNumber`, `maxAttempts`, `backoffMs`, `lastError`
- `canRetry()` and `prepareRetry()` methods exist
- But nothing calls them on failure

### Required (spec lines 1077-1102)

**Platform defaults:**
| Operation | Max Attempts | Backoff | Timeout |
|-----------|--------------|---------|---------|
| Context assembly workflow | 3 | Exponential (100ms, 200ms, 400ms) | 30s |
| Memory extraction workflow | 3 | Exponential (100ms, 200ms, 400ms) | 30s |
| LLM call | 3 | Exponential (500ms, 1s, 2s) | 120s |

Tool retries are for infrastructure errors only. Business errors don't retry.

**Files to modify:**
- [services/agent/src/index.ts](services/agent/src/index.ts) - Add retry logic to error handlers
- [services/agent/src/loop.ts](services/agent/src/loop.ts) - Add retry wrapper for context assembly
- [services/agent/src/llm.ts](services/agent/src/llm.ts) - Add retry wrapper for LLM calls

**Implementation:**

```typescript
// In handleTaskError - check if should retry
async handleTaskError(turnId: string, toolCallId: string, error: unknown): Promise<void> {
  const op = this.asyncOps.get(toolCallId);
  if (!op) return;

  const isRetriable = isInfrastructureError(error);

  if (isRetriable && this.asyncOps.canRetry(toolCallId)) {
    // Schedule retry
    const retryAt = this.asyncOps.prepareRetry(toolCallId, String(error));
    if (retryAt) {
      await this.ctx.storage.setAlarm(retryAt);
      // Re-dispatch the task
      await this.redispatchTask(turnId, toolCallId, op);
      return;
    }
  }

  // No retry - surface error to LLM
  // ... existing error handling
}

// Utility to check error type
function isInfrastructureError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('502')
    );
  }
  return false;
}
```

---

## 5. Input Validation

**Problem:** Tool inputs are not validated against `inputSchema` before dispatch.

### Current State
- Tool definitions include `inputSchema` (JSON Schema)
- `createDispatchDecision()` applies input mapping but no validation
- Invalid inputs go to tools, causing runtime failures

### Required (spec line 137)
> "Validates input against `inputSchema`"

**Files to modify:**
- [services/agent/src/planning/response.ts](services/agent/src/planning/response.ts) - Add validation before dispatch

**Implementation:**

```typescript
// Add JSON Schema validation
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

function validateToolInput(
  input: Record<string, unknown>,
  schema: Record<string, unknown>,
  toolName: string
): { valid: true } | { valid: false; errors: string[] } {
  const validate = ajv.compile(schema);
  const valid = validate(input);

  if (!valid) {
    const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`) ?? [];
    return { valid: false, errors };
  }

  return { valid: true };
}

// In createDispatchDecision - validate before creating decision
function createDispatchDecision(
  turnId: string,
  toolCall: LLMToolUse,
  tool: Tool,
  rawContent?: unknown[],
): AgentDecision | ValidationError {
  const input = applyInputMapping(toolCall.input, tool.inputMapping);

  // Validate input
  const validation = validateToolInput(input, tool.inputSchema, tool.name);
  if (!validation.valid) {
    // Return error decision instead of dispatch
    return {
      type: 'ASYNC_OP_COMPLETED',
      turnId,
      operationId: toolCall.id,
      result: {
        toolCallId: toolCall.id,
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: `Invalid input for ${tool.name}: ${validation.errors.join(', ')}`,
          retriable: false,
        },
      },
    };
  }

  // ... existing dispatch logic
}
```

**Dependencies:**
- Add `ajv` package for JSON Schema validation

---

## 6. D1 Persistence for Observability

**Problem:** Turns and messages exist only in DO SQLite. They need to sync to D1 for observability and UI.

### Current State
- Turns and messages written to DO SQLite only
- No D1 sync for observability/UI access
- `resources.conversations()` etc. exist but not used for writes

### Required (spec lines 325-327)
> "Stores new turns and messages (D1, for observability and UI)"

**Files to modify:**
- [services/agent/src/operations/turns.ts](services/agent/src/operations/turns.ts) - Add D1 sync on create/complete
- [services/agent/src/operations/messages.ts](services/agent/src/operations/messages.ts) - Add D1 sync on append
- [services/agent/src/dispatch/context.ts](services/agent/src/dispatch/context.ts) - Pass resources for D1 access

**Implementation:**

```typescript
// In TurnManager.create - sync to D1
create(params: CreateTurnParams, resources?: Env['RESOURCES']): string {
  const turnId = ulid();
  // ... existing DO SQLite insert

  // Sync to D1 (fire-and-forget for performance)
  if (resources) {
    resources.turns().create({
      id: turnId,
      conversationId: params.conversationId,
      caller: params.caller,
      input: params.input,
      status: 'active',
    }).catch(err => {
      this.emitter.emitTrace({
        type: 'operation.turns.d1_sync_failed',
        payload: { turnId, error: err.message },
      });
    });
  }

  return turnId;
}

// In TurnManager.complete - sync status to D1
complete(turnId: string, issues?: TurnIssues, resources?: Env['RESOURCES']): boolean {
  // ... existing DO SQLite update

  if (resources) {
    resources.turns().update(turnId, {
      status: 'completed',
      completedAt: new Date(),
      issues,
    }).catch(/* ... */);
  }

  return true;
}

// In MessageManager.append - sync to D1
append(params: AppendMessageParams, resources?: Env['RESOURCES']): string {
  // ... existing DO SQLite insert

  if (resources) {
    resources.messages().create({
      id: messageId,
      conversationId: params.conversationId,
      turnId: params.turnId,
      role: params.role,
      content: params.content,
    }).catch(/* ... */);
  }

  return messageId;
}
```

---

## Implementation Order

| Priority | Feature | Effort | Why |
|----------|---------|--------|-----|
| 1 | Memory Workflow Contracts | Small | Completes existing workflow integration |
| 2 | Input Validation | Small | Prevents runtime failures |
| 3 | D1 Persistence | Medium | Enables observability |
| 4 | Retry Logic Execution | Medium | Critical for reliability |
| 5 | WebSocket Connection Handling | Medium | Improves client experience |
| 6 | Shell Operations & Branch Context | Large | Enables code execution |

---

## Critical Files Summary

| File | Changes |
|------|---------|
| [services/agent/src/types.ts](services/agent/src/types.ts) | `toolDefinitions` in input, `BranchContext` |
| [services/agent/src/loop.ts](services/agent/src/loop.ts) | Resolve tool definitions, retry wrapper |
| [services/agent/src/index.ts](services/agent/src/index.ts) | WebSocket handling, retry logic, branch init |
| [services/agent/src/planning/response.ts](services/agent/src/planning/response.ts) | Input validation |
| [services/agent/src/operations/turns.ts](services/agent/src/operations/turns.ts) | D1 sync |
| [services/agent/src/operations/messages.ts](services/agent/src/operations/messages.ts) | D1 sync |
| [services/agent/src/schema/index.ts](services/agent/src/schema/index.ts) | `branchContext` field |
| [services/agent/src/dispatch/apply.ts](services/agent/src/dispatch/apply.ts) | Branch context in dispatch |
| [services/agent/src/llm.ts](services/agent/src/llm.ts) | Retry wrapper |

---

## Dependencies

- `ajv` - JSON Schema validation for input validation
- Resources service methods for D1 sync (may need new endpoints)

---

## Testing

1. **Memory contracts:** Context assembly workflow receives `toolDefinitions`
2. **Input validation:** Invalid tool input → immediate error result to LLM
3. **D1 sync:** Create turn → verify in D1, complete turn → verify status
4. **Retry:** Task fails (retriable) → retry → succeeds (or exhausts attempts)
5. **WebSocket:** Connect → send message → receive streamed response + async results
6. **Branch context:** Shell task → executes on conversation branch
