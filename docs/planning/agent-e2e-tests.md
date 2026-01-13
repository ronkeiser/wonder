# Agent E2E Tests

## Goal

Create an end-to-end test suite for the ConversationRunner coordinator that mirrors the existing workflow test suite. Tests verify the agent loop, tool dispatch, and memory operations by sending messages to real ConversationRunner DOs and asserting on trace events.

## Background

The workflow test suite (`packages/tests/src/tests/workflows/`) validates WorkflowCoordinator and Executor by:

1. Creating real resources via the SDK (workspace, project, workflow)
2. Executing workflows via SSE streaming
3. Collecting trace events that capture internal state transitions
4. Asserting structural and relational properties via `assertInvariants()` and `verify()`

The same pattern applies to agent testing, but with ConversationRunner as the coordinator.

## Architecture Recap

From `docs/architecture/agent.md`:

- **Persona** — Shareable config: system prompt, tools, memory workflow references
- **Agent** — Instance with persona + memory corpus, scoped to projects
- **ConversationRunner** — DO that runs the agent loop for a single conversation
- **Turn** — One cycle: user input → context assembly → LLM → tool execution → memory extraction → response
- **Move** — One iteration within a turn (LLM call + optional tool invocation)

Key insight: **ConversationRunner follows the same pattern as WorkflowCoordinator** — receive → decide → dispatch → wait → resume. The difference is what drives "decide": graph traversal for workflows, LLM reasoning for agents.

## Workflow vs Agent: Parallel Structure

| Workflow | Agent |
|----------|-------|
| WorkflowCoordinator | ConversationRunner |
| Token | Turn |
| Token status transitions | Turn status (`active` → `completed`/`failed`) |
| Graph traversal decides next node | LLM reasoning decides next action |
| Fan-out creates parallel tokens | Parallel turns (multiple active simultaneously) |
| Context (input/state/output in DO SQLite) | Recent turns in DO SQLite, memory in D1/Vectorize |
| Task dispatch to Executor | Tool dispatch to Executor/WorkflowCoordinator/ConversationRunner |
| Subworkflow invocation | Agent invocation (`delegate` or `loop_in` mode) |

## What Agent Tests Verify

### Turn Lifecycle

A turn follows the agent loop:

```
START_TURN (status: active)
  │
  ├─ APPEND_MESSAGE (user)
  │
  ├─ Context assembly workflow dispatched
  │   └─ Returns assembled context (provider-native LLM request)
  │
  ├─ LLM call (direct, with streaming)
  │   │
  │   ├─ [If sync tool_use]
  │   │   ├─ DISPATCH_* + MARK_WAITING
  │   │   ├─ (result via callback)
  │   │   ├─ RESUME_FROM_TOOL
  │   │   └─ Loop back to LLM
  │   │
  │   ├─ [If async tool_use]
  │   │   ├─ DISPATCH_* (async: true) + TRACK_ASYNC_OPERATION
  │   │   ├─ APPEND_MESSAGE (agent: "I'm working on X...")
  │   │   └─ Continue or end turn
  │   │
  │   └─ [If text response, no tools]
  │       └─ Agent done for now
  │
  ├─ [If pending async] → turn stays active, wait for completions
  │   └─ On async complete: ASYNC_OPERATION_COMPLETED → new LLM call → APPEND_MESSAGE
  │
  ├─ [When no pending work]
  │   └─ Memory extraction workflow dispatched
  │
  └─ COMPLETE_TURN
```

### Move Recording

Each iteration of the agent loop within a turn is recorded as a **Move**:

```typescript
interface Move {
  id: string;
  turn_id: string;
  sequence: number;
  reasoning?: string;      // LLM text output
  tool_call?: { tool_id: string; input: Record<string, unknown> };
  tool_result?: Record<string, unknown>;
  created_at: string;
}
```

Tests verify moves accumulate correctly and in causal order.

### Tool Dispatch

Tools dispatch to three targets (same as workflow nodes):

| Target | Mechanism | Wait behavior |
|--------|-----------|---------------|
| Executor (task) | RPC to stateless worker | Sync: wait. Async: continue. |
| WorkflowCoordinator (workflow) | DO-to-DO | Sync: wait. Async: continue. |
| ConversationRunner (agent) | DO-to-DO | Sync: wait. Async: continue. |

**Sync tools**: Turn enters waiting state, result returns via callback, LLM continues reasoning.

**Async tools**: Agent responds immediately ("I've started working on X..."), result triggers continuation on same turn when ready.

### Agent Invocation Modes

When dispatching to another agent:

| Mode | Context | Participation | Result destination |
|------|---------|---------------|-------------------|
| `delegate` | Only explicit input | No (one-shot) | Caller only |
| `loop_in` | Sees conversation history | Yes (joins as participant) | ConversationRunner (all see it) |

### Parallel Turns

Multiple turns can be active simultaneously:

```
User: "Research auth patterns" → Turn A starts (active)
  ├─ Agent: "I'll research that..." (async workflow dispatched)
  │
User: "What's in config.json?" → Turn B starts (active)
  ├─ Agent: "Here's the config..." → Turn B completes
  │
  ├─ [async workflow completes]
  └─ Agent: "Here's what I found..." → Turn A completes
```

Each turn tracks its own pending async operations. Context assembly sees all active turns.

### Context Assembly and Memory Extraction

These are **workflows** dispatched to Executor, not built-in logic:

- `contextAssemblyWorkflowId` — Invoked before every LLM call. Returns provider-native LLM request.
- `memoryExtractionWorkflowId` — Invoked after turn completes. Side effects only (writes to memory via `memory.*` actions).

The platform provides the hooks; libraries provide the strategy.

### Error Handling

| Error Type | Handling |
|------------|----------|
| Infrastructure (network, rate limit, 5xx) | Auto-retry with backoff, invisible to agent |
| Business (tool failed, validation error) | Surface to LLM as tool result with error info |
| Context assembly failure | Retry exhausted → `FAIL_TURN` (no degraded mode) |
| Memory extraction failure | Log and continue, mark turn with `memoryExtractionFailed: true` |

## Test Structure

### Foundation Tests

```
packages/tests/src/tests/conversations/
├── 01-single-turn-no-tools.test.ts        # Simplest: one turn, no tools, verify lifecycle
├── 02-single-turn-sync-tool.test.ts       # Sync tool dispatch to Executor, wait, resume
├── 03-single-turn-async-tool.test.ts      # Async tool, immediate response, continuation
├── 04-multi-turn-sequential.test.ts       # Multiple turns, verify isolation and ordering
├── 05-parallel-turns.test.ts              # Concurrent active turns with async operations
├── 06-tool-dispatch-workflow.test.ts      # Tool dispatches to WorkflowCoordinator
├── 07-tool-dispatch-agent-delegate.test.ts # Tool dispatches to agent (delegate mode)
├── 08-tool-dispatch-agent-loopin.test.ts  # Tool dispatches to agent (loop_in mode)
├── 09-context-assembly-workflow.test.ts   # Context assembly workflow invocation
├── 10-memory-extraction-workflow.test.ts  # Memory extraction workflow invocation
├── 11-move-accumulation.test.ts           # Multiple moves within single turn
├── 12-tool-failure-handling.test.ts       # Tool errors surface to LLM
├── 13-context-assembly-failure.test.ts    # Context assembly fails → turn fails
├── 14-memory-extraction-failure.test.ts   # Memory extraction fails → turn completes with flag
```

### Test 01: Single Turn, No Tools

The simplest possible test. One turn, no tools, verify basic lifecycle.

```typescript
describe('Foundation: 01 - Single Turn, No Tools', () => {
  it('executes single turn with correct lifecycle', async () => {
    const testPersona = persona({
      name: 'Greeter',
      systemPrompt: 'You are a friendly greeter. Respond briefly.',
      tools: [],
    });

    const { result } = await runTestConversation(testPersona, [
      { role: 'user', content: 'Hello!' },
    ]);

    const { trace } = result;

    // INVARIANTS
    assertConversationInvariants(trace);

    // STATUS
    expect(result.status).toBe('completed');

    // TURN LIFECYCLE
    const turnStarts = trace.turns.starts();
    expect(turnStarts).toHaveLength(1);

    const turnId = turnStarts[0].payload.turnId;
    expect(trace.turns.statusTransitions(turnId)).toEqual(['active', 'completed']);

    // MESSAGES
    const userMessages = trace.messages.user();
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].payload.content).toBe('Hello!');

    const assistantMessages = trace.messages.assistant();
    expect(assistantMessages).toHaveLength(1);

    // CONTEXT ASSEMBLY (workflow dispatched)
    const contextAssemblyStarts = trace.contextAssembly.starts();
    expect(contextAssemblyStarts).toHaveLength(1);
    expect(contextAssemblyStarts[0].payload.turnId).toBe(turnId);

    // LLM CALL (direct, not via task)
    const llmCalls = trace.llm.calls();
    expect(llmCalls).toHaveLength(1);

    // MEMORY EXTRACTION (workflow dispatched after turn)
    const memoryExtractionStarts = trace.memoryExtraction.starts();
    expect(memoryExtractionStarts).toHaveLength(1);

    // NO TOOLS
    expect(trace.tools.invocations()).toHaveLength(0);

    // MOVES (one move: LLM reasoning with no tool call)
    const moves = trace.moves.forTurn(turnId);
    expect(moves).toHaveLength(1);
    expect(moves[0].payload.reasoning).toBeDefined();
    expect(moves[0].payload.tool_call).toBeUndefined();

    // CAUSAL ORDERING
    expect(turnStarts[0].sequence).toBeLessThan(contextAssemblyStarts[0].sequence);
    expect(contextAssemblyStarts[0].sequence).toBeLessThan(llmCalls[0].sequence);
    expect(llmCalls[0].sequence).toBeLessThan(assistantMessages[0].sequence);
  });
});
```

### Test 02: Single Turn, Sync Tool

Tests sync tool dispatch: agent waits for result, then continues reasoning.

```typescript
describe('Foundation: 02 - Single Turn, Sync Tool', () => {
  it('dispatches sync tool, waits, resumes with result', async () => {
    const echoTask = task({
      name: 'Echo Task',
      inputSchema: s.object({ text: s.string() }),
      outputSchema: s.object({ echoed: s.string() }),
      steps: [
        step({
          ref: 'echo',
          ordinal: 0,
          action: action({
            name: 'Echo',
            kind: 'mock',
            implementation: { schema: s.object({ echoed: s.string() }) },
          }),
          outputMapping: { 'output.echoed': 'result.echoed' },
        }),
      ],
    });

    const testPersona = persona({
      name: 'Echo Agent',
      systemPrompt: 'Use the echo tool when asked to echo something.',
      tools: [
        tool({
          name: 'echo',
          description: 'Echo back the input text',
          inputSchema: s.object({ text: s.string() }),
          targetType: 'task',
          targetId: echoTask, // embedded, will be created
        }),
      ],
    });

    const { result } = await runTestConversation(testPersona, [
      { role: 'user', content: 'Echo: hello world' },
    ]);

    const { trace } = result;
    assertConversationInvariants(trace);

    const turnId = trace.turns.starts()[0].payload.turnId;

    // TOOL DISPATCH
    const toolInvocations = trace.tools.invocations();
    expect(toolInvocations).toHaveLength(1);
    expect(toolInvocations[0].payload.toolName).toBe('echo');
    expect(toolInvocations[0].payload.async).toBe(false);

    // WAITING STATE
    const waitEvents = trace.turns.waits(turnId);
    expect(waitEvents).toHaveLength(1);

    // RESUME FROM TOOL
    const resumeEvents = trace.turns.resumes(turnId);
    expect(resumeEvents).toHaveLength(1);

    // TOOL COMPLETION
    const toolCompletions = trace.tools.completions();
    expect(toolCompletions).toHaveLength(1);

    // EXECUTOR EVENTS (task ran in Executor)
    expect(trace.executor.taskStarts()).toHaveLength(1);
    expect(trace.executor.taskCompletions()).toHaveLength(1);

    // MULTIPLE LLM CALLS (before tool, after tool)
    const llmCalls = trace.llm.calls();
    expect(llmCalls.length).toBeGreaterThanOrEqual(2);

    // MOVES (at least 2: tool call, then final response)
    const moves = trace.moves.forTurn(turnId);
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(moves.some(m => m.payload.tool_call?.tool_id === 'echo')).toBe(true);
    expect(moves.some(m => m.payload.tool_result)).toBe(true);
  });
});
```

### Test 03: Single Turn, Async Tool

Tests async tool dispatch: agent responds immediately, continuation when result arrives.

```typescript
describe('Foundation: 03 - Single Turn, Async Tool', () => {
  it('dispatches async tool, responds immediately, continues on completion', async () => {
    const slowWorkflow = workflow({
      name: 'Slow Research',
      // ... workflow that takes time
    });

    const testPersona = persona({
      name: 'Researcher',
      systemPrompt: 'Use the research tool for research questions.',
      tools: [
        tool({
          name: 'research',
          description: 'Research a topic (takes time)',
          inputSchema: s.object({ topic: s.string() }),
          targetType: 'workflow',
          targetId: slowWorkflow,
          async: true, // Key: async tool
        }),
      ],
    });

    const { result } = await runTestConversation(testPersona, [
      { role: 'user', content: 'Research authentication patterns' },
    ]);

    const { trace } = result;
    assertConversationInvariants(trace);

    const turnId = trace.turns.starts()[0].payload.turnId;

    // TOOL DISPATCHED AS ASYNC
    const toolInvocations = trace.tools.invocations();
    expect(toolInvocations).toHaveLength(1);
    expect(toolInvocations[0].payload.async).toBe(true);

    // ASYNC TRACKING
    const asyncTracks = trace.turns.asyncOperations(turnId);
    expect(asyncTracks).toHaveLength(1);

    // IMMEDIATE RESPONSE (agent didn't wait)
    const assistantMessages = trace.messages.assistant();
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    // First message should be acknowledgment, not final result
    expect(assistantMessages[0].payload.content).toMatch(/working|started|research/i);

    // ASYNC COMPLETION TRIGGERS CONTINUATION
    const asyncCompletions = trace.turns.asyncCompletions(turnId);
    expect(asyncCompletions).toHaveLength(1);

    // FINAL MESSAGE AFTER ASYNC COMPLETE
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2);

    // TURN STAYED ACTIVE UNTIL ASYNC COMPLETE
    const statusTransitions = trace.turns.statusTransitions(turnId);
    expect(statusTransitions).toEqual(['active', 'completed']);
  });
});
```

### Test 05: Parallel Turns

Tests multiple active turns with interleaved async operations.

```typescript
describe('Foundation: 05 - Parallel Turns', () => {
  it('handles multiple active turns with async operations', async () => {
    const testPersona = persona({
      name: 'Multi-tasker',
      tools: [
        tool({
          name: 'slow_task',
          targetType: 'workflow',
          targetId: slowWorkflow,
          async: true,
        }),
        tool({
          name: 'fast_task',
          targetType: 'task',
          targetId: fastTask,
          async: false,
        }),
      ],
    });

    // Send two messages that will create parallel turns
    const { result } = await runTestConversation(testPersona, [
      { role: 'user', content: 'Do slow research' },    // Turn A - async
      { role: 'user', content: 'Do fast lookup' },      // Turn B - sync
    ]);

    const { trace } = result;
    assertConversationInvariants(trace);

    // TWO TURNS CREATED
    const turnStarts = trace.turns.starts();
    expect(turnStarts).toHaveLength(2);
    const [turnA, turnB] = turnStarts.map(t => t.payload.turnId);

    // TURN B COMPLETES BEFORE TURN A
    const turnAComplete = trace.turns.completion(turnA);
    const turnBComplete = trace.turns.completion(turnB);
    expect(turnBComplete!.sequence).toBeLessThan(turnAComplete!.sequence);

    // BOTH EVENTUALLY COMPLETE
    expect(trace.turns.statusTransitions(turnA)).toEqual(['active', 'completed']);
    expect(trace.turns.statusTransitions(turnB)).toEqual(['active', 'completed']);
  });
});
```

### Test 07: Agent Dispatch (Delegate Mode)

Tests dispatching to another agent with context isolation.

```typescript
describe('Foundation: 07 - Agent Dispatch (Delegate)', () => {
  it('dispatches to agent with clean context, receives result', async () => {
    const reviewerPersona = persona({
      name: 'Reviewer',
      systemPrompt: 'Review code and provide feedback.',
      tools: [],
    });

    const managerPersona = persona({
      name: 'Manager',
      systemPrompt: 'Delegate review tasks to the reviewer.',
      tools: [
        tool({
          name: 'ask_reviewer',
          description: 'Ask the reviewer to review code',
          inputSchema: s.object({ code: s.string() }),
          targetType: 'agent',
          targetId: reviewerPersona, // embedded, will create agent
          invocationMode: 'delegate', // Clean context, one-shot
        }),
      ],
    });

    const { result } = await runTestConversation(managerPersona, [
      { role: 'user', content: 'Please review this code: function add(a, b) { return a + b; }' },
    ]);

    const { trace } = result;
    assertConversationInvariants(trace);

    // TOOL DISPATCH TO AGENT
    const toolInvocations = trace.tools.invocations();
    expect(toolInvocations).toHaveLength(1);
    expect(toolInvocations[0].payload.targetType).toBe('agent');
    expect(toolInvocations[0].payload.invocationMode).toBe('delegate');

    // CHILD AGENT TURN EXECUTED
    const agentCalls = trace.agents.calls();
    expect(agentCalls).toHaveLength(1);
    expect(agentCalls[0].payload.mode).toBe('delegate');

    // CHILD AGENT DID NOT SEE PARENT CONVERSATION HISTORY
    const childContext = trace.agents.contextFor(agentCalls[0].payload.callId);
    expect(childContext.payload.conversationHistory).toBeUndefined();

    // RESULT FLOWED BACK
    const toolCompletions = trace.tools.completions();
    expect(toolCompletions).toHaveLength(1);
  });
});
```

### Test 12: Tool Failure Handling

Tests that tool errors surface to LLM for reasoning.

```typescript
describe('Foundation: 12 - Tool Failure Handling', () => {
  it('surfaces tool errors to LLM, agent reasons about failure', async () => {
    const failingTask = task({
      name: 'Failing Task',
      steps: [
        step({
          action: action({
            kind: 'mock',
            implementation: {
              schema: s.object({}),
              options: { shouldFail: true, errorMessage: 'Connection refused' },
            },
          }),
        }),
      ],
    });

    const testPersona = persona({
      name: 'Resilient Agent',
      systemPrompt: 'Try the flaky_service tool. If it fails, explain the error to the user.',
      tools: [
        tool({
          name: 'flaky_service',
          targetType: 'task',
          targetId: failingTask,
        }),
      ],
    });

    const { result } = await runTestConversation(testPersona, [
      { role: 'user', content: 'Call the flaky service' },
    ]);

    const { trace } = result;
    // Note: NOT assertConversationInvariants - we expect tool failure

    // TURN STILL COMPLETES (business error, not infrastructure)
    expect(result.status).toBe('completed');

    // TOOL FAILED
    const toolFailures = trace.tools.failures();
    expect(toolFailures).toHaveLength(1);
    expect(toolFailures[0].payload.error.code).toBe('EXECUTION_FAILED');

    // ERROR SURFACED TO LLM
    const moves = trace.moves.forTurn(trace.turns.starts()[0].payload.turnId);
    const failureMove = moves.find(m => m.payload.tool_result?.success === false);
    expect(failureMove).toBeDefined();
    expect(failureMove!.payload.tool_result.error.message).toContain('Connection refused');

    // LLM REASONED ABOUT FAILURE (another LLM call after the error)
    const llmCalls = trace.llm.calls();
    expect(llmCalls.length).toBeGreaterThanOrEqual(2);

    // FINAL RESPONSE MENTIONS THE ERROR
    const finalMessage = trace.messages.assistant().at(-1);
    expect(finalMessage!.payload.content).toMatch(/fail|error|couldn't|unable/i);
  });
});
```

## Test Kit API

### `runTestConversation()`

Scaffolds infrastructure, creates agent from persona, sends messages, collects trace events.

```typescript
async function runTestConversation(
  personaDef: EmbeddedPersona,
  messages: Array<{ role: 'user'; content: string }>,
  options?: {
    timeout?: number;
    logEvents?: boolean;
  },
): Promise<TestConversationResult> {
  // 1. Setup test context (workspace, project)
  const ctx = await setupTestContext();

  // 2. Create embedded resources (tools → tasks, workflows, agents)
  const setup = await createConversation(ctx, personaDef);

  // 3. Connect to conversation via SSE/WebSocket
  // 4. Send each message, collect trace events
  // 5. Return result with cleanup function
}
```

### `ConversationTraceEventCollection`

Extends base `TraceEventCollection` with conversation-specific accessors:

```typescript
class ConversationTraceEventCollection extends TraceEventCollection {
  get turns() {
    return {
      starts(): TypedTraceEvent<TurnStartPayload>[];
      completions(): TypedTraceEvent<TurnCompletePayload>[];
      failures(): TypedTraceEvent<TurnFailedPayload>[];
      completion(turnId: string): TypedTraceEvent<TurnCompletePayload> | undefined;
      statusTransitions(turnId: string): TurnStatus[];
      waits(turnId: string): TypedTraceEvent<TurnWaitPayload>[];
      resumes(turnId: string): TypedTraceEvent<TurnResumePayload>[];
      asyncOperations(turnId: string): TypedTraceEvent<AsyncTrackPayload>[];
      asyncCompletions(turnId: string): TypedTraceEvent<AsyncCompletePayload>[];
    };
  }

  get moves() {
    return {
      all(): TypedTraceEvent<MovePayload>[];
      forTurn(turnId: string): TypedTraceEvent<MovePayload>[];
    };
  }

  get messages() {
    return {
      user(): TypedTraceEvent<UserMessagePayload>[];
      assistant(): TypedTraceEvent<AssistantMessagePayload>[];
      inTurn(turnId: string): TypedTraceEvent<MessagePayload>[];
    };
  }

  get tools() {
    return {
      invocations(): TypedTraceEvent<ToolInvocationPayload>[];
      completions(): TypedTraceEvent<ToolCompletionPayload>[];
      failures(): TypedTraceEvent<ToolFailurePayload>[];
      byName(toolName: string): TypedTraceEvent[];
    };
  }

  get contextAssembly() {
    return {
      starts(): TypedTraceEvent<ContextAssemblyStartPayload>[];
      completions(): TypedTraceEvent<ContextAssemblyCompletePayload>[];
      forTurn(turnId: string): TypedTraceEvent[];
    };
  }

  get memoryExtraction() {
    return {
      starts(): TypedTraceEvent<MemoryExtractionStartPayload>[];
      completions(): TypedTraceEvent<MemoryExtractionCompletePayload>[];
      failures(): TypedTraceEvent<MemoryExtractionFailedPayload>[];
      forTurn(turnId: string): TypedTraceEvent[];
    };
  }

  get llm() {
    return {
      calls(): TypedTraceEvent<LLMCallPayload>[];
      completions(): TypedTraceEvent<LLMCompletePayload>[];
      forTurn(turnId: string): TypedTraceEvent[];
    };
  }

  get agents() {
    return {
      calls(): TypedTraceEvent<AgentCallPayload>[];
      completions(): TypedTraceEvent<AgentCompletePayload>[];
      contextFor(callId: string): TypedTraceEvent<AgentContextPayload>;
    };
  }
}
```

### `ConversationVerifier`

Fluent API for declarative verification:

```typescript
verify(trace, { messages, definition: personaDef })
  .completed()
  .withTurns({
    count: 2,
    allCompleted: true,
  })
  .withMoves({
    forTurn: turnId,
    minCount: 3,
    hasToolCall: 'echo',
  })
  .withToolInvocations([
    { name: 'echo', completed: true, async: false },
    { name: 'research', completed: true, async: true },
  ])
  .withContextAssembly({
    invokedPerTurn: true,
  })
  .withMemoryExtraction({
    invokedOnComplete: true,
  })
  .run();
```

### `assertConversationInvariants()`

Universal invariants for every conversation:

```typescript
function assertConversationInvariants(
  trace: ConversationTraceEventCollection,
  options?: { allowFailedTurns?: boolean },
): void {
  // 1. Every turn reaches terminal state (completed or failed)
  for (const start of trace.turns.starts()) {
    const turnId = start.payload.turnId;
    const statuses = trace.turns.statusTransitions(turnId);
    const finalStatus = statuses.at(-1);
    expect(
      ['completed', 'failed'],
      `Turn ${turnId} did not reach terminal state: ${statuses.join(' → ')}`,
    ).toContain(finalStatus);
  }

  // 2. Every sync tool invocation has a result (completion or failure)
  for (const invocation of trace.tools.invocations()) {
    if (invocation.payload.async) continue; // Async checked separately
    const toolCallId = invocation.payload.toolCallId;
    const hasResult =
      trace.tools.completions().some(c => c.payload.toolCallId === toolCallId) ||
      trace.tools.failures().some(f => f.payload.toolCallId === toolCallId);
    expect(hasResult, `Sync tool call ${toolCallId} has no result`).toBe(true);
  }

  // 3. Every async operation tracked on a turn has a completion
  for (const track of trace.turns.asyncOperations()) {
    const opId = track.payload.operationId;
    const completion = trace.turns.asyncCompletions().find(c => c.payload.operationId === opId);
    expect(completion, `Async operation ${opId} never completed`).toBeDefined();
  }

  // 4. Context assembly invoked for each turn
  for (const start of trace.turns.starts()) {
    const turnId = start.payload.turnId;
    const contextAssembly = trace.contextAssembly.forTurn(turnId);
    expect(contextAssembly.length, `No context assembly for turn ${turnId}`).toBeGreaterThan(0);
  }

  // 5. Memory extraction invoked for completed turns
  for (const completion of trace.turns.completions()) {
    const turnId = completion.payload.turnId;
    const memoryExtraction = trace.memoryExtraction.forTurn(turnId);
    expect(memoryExtraction.length, `No memory extraction for turn ${turnId}`).toBeGreaterThan(0);
  }

  // 6. Sequences are positive
  const sequences = trace.all().map(e => e.sequence);
  expect(sequences.every(seq => seq > 0), 'All sequences must be positive').toBe(true);

  // 7. No error events (unless allowFailedTurns)
  if (!options?.allowFailedTurns) {
    expect(trace.errors.all(), 'No error events should occur').toHaveLength(0);
  }
}
```

## Trace Event Types

### Turn Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `turn.started` | `{ turnId, conversationId, callerId, callerType }` | Turn began |
| `turn.completed` | `{ turnId, issues? }` | Turn finished successfully |
| `turn.failed` | `{ turnId, error }` | Turn failed (e.g., context assembly exhausted retries) |
| `turn.waiting` | `{ turnId, operationId }` | Turn waiting for sync tool result |
| `turn.resumed` | `{ turnId, operationId }` | Turn resumed after sync tool completed |
| `turn.async_tracked` | `{ turnId, operationId }` | Async operation started, turn stays active |
| `turn.async_completed` | `{ turnId, operationId, result }` | Async operation finished |

### Move Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `move.recorded` | `{ turnId, moveId, sequence, reasoning?, tool_call?, tool_result? }` | Move recorded within turn |

### Message Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `message.user` | `{ turnId, messageId, content }` | User message appended |
| `message.assistant` | `{ turnId, messageId, content, hasToolUse }` | Assistant message appended |

### Tool Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `tool.invoked` | `{ turnId, toolCallId, toolName, targetType, targetId, async }` | Tool dispatch started |
| `tool.completed` | `{ turnId, toolCallId, output }` | Tool succeeded |
| `tool.failed` | `{ turnId, toolCallId, error: { code, message, retriable } }` | Tool failed |

### Context Assembly Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `context_assembly.started` | `{ turnId, workflowId }` | Context assembly workflow dispatched |
| `context_assembly.completed` | `{ turnId, tokenCount }` | Context assembly finished |
| `context_assembly.failed` | `{ turnId, error, retriesExhausted }` | Context assembly failed |

### Memory Extraction Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `memory_extraction.started` | `{ turnId, workflowId }` | Memory extraction workflow dispatched |
| `memory_extraction.completed` | `{ turnId }` | Memory extraction finished |
| `memory_extraction.failed` | `{ turnId, error }` | Memory extraction failed (turn still completed) |

### LLM Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `llm.call.started` | `{ turnId, modelProfileId, inputTokens }` | LLM call started |
| `llm.call.completed` | `{ turnId, outputTokens, hasToolUse, stopReason }` | LLM call finished |

### Agent Invocation Events

| Event Type | Payload | Description |
|------------|---------|-------------|
| `agent.call.started` | `{ turnId, callId, agentId, mode }` | Agent invocation started |
| `agent.call.completed` | `{ turnId, callId, output }` | Agent invocation completed |
| `agent.call.failed` | `{ turnId, callId, error }` | Agent invocation failed |

## Implementation Plan

### Phase 1: Trace Events

1. **Define decision types** — `AgentDecision` types in ConversationRunner service (already in architecture doc)
2. **Emit trace events** — ConversationRunner emits events matching the table above
3. **Test event emission** — Basic tests that events are emitted correctly

### Phase 2: Test Kit

4. **Create `ConversationTraceEventCollection`** — Extend base collection with conversation accessors
5. **Create `runTestConversation()`** — Scaffold agent, send messages, collect events
6. **Create `assertConversationInvariants()`** — Universal invariants
7. **Create `ConversationVerifier`** — Fluent verification API
8. **Create SDK builders** — `persona()`, `tool()` for embedded definitions

### Phase 3: Foundation Tests

9. **Tests 01-03** — Single turn tests (no tools, sync tool, async tool)
10. **Tests 04-05** — Multi-turn and parallel turns
11. **Tests 06-08** — Tool dispatch to workflow, agent (delegate), agent (loop_in)
12. **Tests 09-10** — Context assembly and memory extraction workflow invocation
13. **Tests 11-14** — Moves, error handling

## File Changes

| File | Change |
|------|--------|
| `services/agent/src/trace.ts` | New — Trace event emission |
| `packages/tests/src/kit/conversation-trace.ts` | New — ConversationTraceEventCollection |
| `packages/tests/src/kit/conversation.ts` | New — runTestConversation, createConversation |
| `packages/tests/src/kit/conversation-verify.ts` | New — ConversationVerifier |
| `packages/tests/src/kit/conversation-invariants.ts` | New — assertConversationInvariants |
| `packages/tests/src/kit/index.ts` | Export conversation utilities |
| `packages/tests/src/tests/conversations/*.test.ts` | New — Test files |

## Dependencies

- ConversationRunner must emit trace events (Phase 1)
- SDK must expose conversation message sending with SSE streaming
- Persona/Agent/Tool definitions must be creatable via SDK

## Open Questions

1. **Mock LLM responses** — For deterministic tests, we need a way to script LLM responses. Options:
   - Mock model profile that returns scripted responses based on input patterns
   - Test-only endpoint that accepts response scripts
   - Use real LLM with very constrained prompts (slower, non-deterministic)

2. **Context assembly/memory extraction workflows for tests** — Tests need simple workflows for these hooks:
   - Option A: Create minimal test workflows that pass through
   - Option B: Test with null workflows (if platform supports skipping)
   - Option C: Use library-provided defaults

3. **WebSocket vs SSE** — The architecture mentions WebSocket for streaming. Need to confirm:
   - Does the SDK expose WebSocket connection for conversations?
   - Or is there an SSE endpoint similar to workflow execution?
