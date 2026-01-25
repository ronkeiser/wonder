# LLM Provider Adapters

## Goal

Maintain clean separation between our domain model and LLM provider-specific formats. The agent service uses its own vocabulary internally; provider adapters translate at the boundary.

## Core Insight

LLMs are stateless. Every "turn" is a forward pass through a stateless model. Providers like Anthropic, OpenAI, and Llama all:

1. Accept a messages array as input
2. Combine those messages into a single prompt under the hood
3. Generate a response

The "conversation" abstraction is a convenience API, not a fundamental model capability. Anthropic's `assistant` role, OpenAI's `assistant` role, and Llama's equivalent are provider vocabulary—not our domain vocabulary.

## Domain vs Provider Vocabulary

**Our domain:**
- `agent` — our intelligent agent responding to users
- `user` — human user sending messages
- Tools are capabilities the agent can invoke

**Provider vocabulary (Anthropic, OpenAI, Llama):**
- `assistant` — their term for the AI respondent
- `user` — same meaning
- Tools/functions — their API for structured output

The translation `agent → assistant` happens at the provider boundary, not in our core modules.

## Current Implementation

```
services/agent/src/llm/
  index.ts       # Routes to adapters, re-exports types
  types.ts       # Internal types using domain vocabulary
  anthropic.ts   # Anthropic adapter with role translation
```

### Types (`llm/types.ts`)

```typescript
// Our domain roles
export type MessageRole = 'user' | 'agent';

export type Message = {
  role: MessageRole;
  content: string;
};

// Standard request using our format
export type LLMRequest = {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  messages: Message[];
};

// Raw request for tool continuation (passthrough)
export type LLMRawRequest = {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  messages: unknown[];
};
```

### Adapter (`llm/anthropic.ts`)

```typescript
// Translation at provider boundary
function translateMessages(messages: LLMRequest['messages']): AnthropicMessage[] {
  return messages.map((msg) => ({
    role: msg.role === 'agent' ? 'assistant' : msg.role,
    content: msg.content,
  }));
}

function translateTools(tools: LLMToolSpec[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
```

### Usage in Loop (`loop.ts`)

```typescript
// Detection: is this a standard request or a raw continuation?
const isRaw = llmRequest.messages.some((msg) => {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as { role?: string; content?: unknown };
  return m.role === 'assistant' || Array.isArray(m.content);
});

// Route to appropriate function
if (isRaw) {
  response = await callLLMRaw(llmRequest as LLMRawRequest, specs, apiKey);
} else {
  response = await callLLM(llmRequest as LLMRequest, specs, apiKey);
}
```

## The Continuation Problem

When an LLM uses a tool, the conversation continues:

1. LLM returns `tool_use` block
2. We execute the tool
3. We send `tool_result` back to LLM
4. LLM continues

This requires provider-specific message formats:

```typescript
// Anthropic continuation format
[
  { role: 'user', content: 'What time is it?' },
  { role: 'assistant', content: [
    { type: 'text', text: 'Let me check...' },
    { type: 'tool_use', id: 'call_123', name: 'get_time', input: {} }
  ]},
  { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'call_123', content: '3:45 PM' }
  ]},
]
```

### Current Solution: `LLMRawRequest`

The current implementation stores `rawContent` (provider-native format) from LLM responses and passes it through on continuation:

```typescript
// Response includes raw content
export type LLMResponse = {
  text?: string;
  toolUse?: LLMToolUse[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  rawContent?: unknown[];  // Provider-native format for continuation
};
```

The `callLLMRaw` function accepts `LLMRawRequest` and passes messages through without translation.

### Problem: Provider Lock-in

Storing `rawContent` in persistence (moves table) means:
- Data is in Anthropic format
- Can't switch providers without data migration
- Domain layer leaks provider concerns

## Holistic Solution

The ideal architecture stores domain data only. Adapters build all provider-specific formats.

### Storage: Domain Data Only

```typescript
// Store what the agent did, not how Anthropic formatted it
type MoveRow = {
  sequence: number;
  reasoning?: string;
  toolId?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  // No rawContent — that's provider vocabulary
};
```

### Adapters: Build Continuation Messages

Each adapter implements `buildContinuationRequest`:

```typescript
// llm/anthropic.ts
export function buildContinuationRequest(
  baseRequest: LLMRequest,
  moves: Move[],
): AnthropicRequest {
  const messages: AnthropicMessage[] = translateMessages(baseRequest.messages);

  // Build continuation from domain data
  for (const move of moves) {
    if (move.toolCall) {
      // Add assistant message with tool_use
      messages.push({
        role: 'assistant',
        content: [
          ...(move.reasoning ? [{ type: 'text', text: move.reasoning }] : []),
          {
            type: 'tool_use',
            id: generateToolUseId(move),
            name: move.toolCall.name,
            input: move.toolCall.input,
          },
        ],
      });

      // Add user message with tool_result
      if (move.toolResult) {
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: generateToolUseId(move),
            content: JSON.stringify(move.toolResult),
          }],
        });
      }
    }
  }

  return {
    model: baseRequest.model ?? 'claude-sonnet-4-20250514',
    max_tokens: baseRequest.maxTokens ?? 4096,
    messages,
    system: baseRequest.systemPrompt,
  };
}
```

### Benefits

1. **Provider independence**: Switch from Anthropic to OpenAI by adding an adapter
2. **Clean persistence**: Database stores domain concepts only
3. **Single request type**: No `LLMRawRequest` escape hatch needed
4. **Testable**: Adapters are pure functions, easy to unit test

## Adding a New Provider

To add OpenAI or Llama support:

1. Create `llm/openai.ts` (or `llm/llama.ts`)
2. Implement role/tool translation functions
3. Implement `callLLM`, `callLLMWithStreaming`
4. Implement `buildContinuationRequest`
5. Update `llm/index.ts` to route based on model/configuration

All providers follow the same pattern:
- Accept `LLMRequest` with domain vocabulary
- Translate to provider format
- Make API call
- Translate response back to `LLMResponse`

## Migration Path

### Current State (Shortcut)

- `rawContent` stored in moves table
- `LLMRawRequest` used for continuation
- Works, but couples persistence to Anthropic format

### Target State (Holistic)

1. Remove `rawContent` from `LLMResponse` and moves storage
2. Remove `LLMRawRequest` type
3. Add `buildContinuationRequest` to each adapter
4. Update `runLLMLoop` to always use standard `LLMRequest`
5. Build continuation messages from domain data (moves)

The migration is non-breaking internally—it's a refactor of how continuation requests are constructed.

## Industry Standard

Research confirms all major providers use the same pattern:

| Provider | User Role | AI Role | Tool Format |
|----------|-----------|---------|-------------|
| Anthropic | `user` | `assistant` | `tool_use` / `tool_result` |
| OpenAI | `user` | `assistant` | `function` / `tool` |
| Llama 4 | `user` | `assistant` | Similar structured format |

The messages array abstraction is universal. Only the details differ:
- Role names (all use `assistant`)
- Tool format (slightly different JSON structures)
- API endpoints and headers

Our adapter pattern handles all of these at the boundary.