/**
 * Anthropic LLM Adapter
 *
 * Translates our internal LLM request format to Anthropic's API format
 * and handles API communication.
 */

import type { LLMRawRequest, LLMRequest, LLMResponse, LLMToolSpec, LLMToolUse, StreamCallback } from './types';

// ============================================================================
// Constants
// ============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// ============================================================================
// Anthropic Types
// ============================================================================

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type AnthropicRequest = {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
  temperature?: number;
};

type AnthropicResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

type AnthropicError = {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
};

// ============================================================================
// Request Translation
// ============================================================================

/**
 * Translate our internal message format to Anthropic's format.
 *
 * Key translation: our 'agent' role → Anthropic's 'assistant' role
 */
function translateMessages(messages: LLMRequest['messages']): AnthropicMessage[] {
  return messages.map((msg) => ({
    role: msg.role === 'agent' ? 'assistant' : msg.role,
    content: msg.content,
  }));
}

/**
 * Translate our tool specs to Anthropic's format.
 */
function translateTools(tools: LLMToolSpec[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

// ============================================================================
// LLM Call
// ============================================================================

/**
 * Call the Anthropic API with our internal request format.
 */
export async function callLLM(
  request: LLMRequest,
  tools: LLMToolSpec[],
  apiKey: string,
): Promise<LLMResponse> {
  const anthropicRequest: AnthropicRequest = {
    model: request.model ?? 'claude-sonnet-4-20250514',
    max_tokens: request.maxTokens ?? 4096,
    messages: translateMessages(request.messages),
    temperature: request.temperature,
  };

  if (request.systemPrompt) {
    anthropicRequest.system = request.systemPrompt;
  }

  if (tools.length > 0) {
    anthropicRequest.tools = translateTools(tools);
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(anthropicRequest),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as AnthropicError;
    const errorMessage = errorBody.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Anthropic API error: ${errorMessage}`);
  }

  const result = (await response.json()) as AnthropicResponse;

  return parseAnthropicResponse(result);
}

/**
 * Call the Anthropic API with raw messages (for tool continuation).
 *
 * Use this when the messages are already in Anthropic format (e.g., with
 * tool_use and tool_result content blocks).
 */
export async function callLLMRaw(
  request: LLMRawRequest,
  tools: LLMToolSpec[],
  apiKey: string,
): Promise<LLMResponse> {
  const anthropicRequest: AnthropicRequest = {
    model: request.model ?? 'claude-sonnet-4-20250514',
    max_tokens: request.maxTokens ?? 4096,
    messages: request.messages as AnthropicMessage[],
    temperature: request.temperature,
  };

  if (request.systemPrompt) {
    anthropicRequest.system = request.systemPrompt;
  }

  if (tools.length > 0) {
    anthropicRequest.tools = translateTools(tools);
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(anthropicRequest),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as AnthropicError;
    const errorMessage = errorBody.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Anthropic API error: ${errorMessage}`);
  }

  const result = (await response.json()) as AnthropicResponse;

  return parseAnthropicResponse(result);
}

// ============================================================================
// Streaming
// ============================================================================

/**
 * Call the Anthropic API with streaming.
 */
export async function callLLMWithStreaming(
  request: LLMRequest,
  tools: LLMToolSpec[],
  apiKey: string,
  onToken: StreamCallback,
): Promise<LLMResponse> {
  const anthropicRequest: AnthropicRequest & { stream: boolean } = {
    model: request.model ?? 'claude-sonnet-4-20250514',
    max_tokens: request.maxTokens ?? 4096,
    messages: translateMessages(request.messages),
    temperature: request.temperature,
    stream: true,
  };

  if (request.systemPrompt) {
    anthropicRequest.system = request.systemPrompt;
  }

  if (tools.length > 0) {
    anthropicRequest.tools = translateTools(tools);
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(anthropicRequest),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as AnthropicError;
    const errorMessage = errorBody.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Anthropic API error: ${errorMessage}`);
  }

  if (!response.body) {
    throw new Error('No response body for streaming');
  }

  return processAnthropicStream(response.body, onToken);
}

// ============================================================================
// Response Parsing
// ============================================================================

function parseAnthropicResponse(response: AnthropicResponse): LLMResponse {
  const textBlocks = response.content.filter(
    (block): block is { type: 'text'; text: string } => block.type === 'text',
  );
  const text = textBlocks.map((b) => b.text).join('');

  const toolUseBlocks = response.content.filter(
    (block): block is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
      block.type === 'tool_use',
  );

  const toolUse: LLMToolUse[] | undefined =
    toolUseBlocks.length > 0
      ? toolUseBlocks.map((b) => ({
          id: b.id,
          name: b.name,
          input: b.input,
        }))
      : undefined;

  const stopReason: LLMResponse['stopReason'] =
    response.stop_reason === 'tool_use'
      ? 'tool_use'
      : response.stop_reason === 'max_tokens'
        ? 'max_tokens'
        : 'end_turn';

  return {
    text: text || undefined,
    toolUse,
    stopReason,
    rawContent: response.content,
  };
}

// ============================================================================
// Stream Processing
// ============================================================================

type StreamEvent =
  | { type: 'message_start'; message: { id: string } }
  | { type: 'content_block_start'; index: number; content_block: AnthropicContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentBlockDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string } }
  | { type: 'message_stop' };

type ContentBlockDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string };

type StreamEventResult = {
  text?: string;
  toolUse?: LLMToolUse;
  currentToolUse?: { id: string; name: string; inputJson: string } | null;
  stopReason?: LLMResponse['stopReason'];
};

async function processAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onToken: StreamCallback,
): Promise<LLMResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let fullText = '';
  const toolUseBlocks: LLMToolUse[] = [];
  const rawContentBlocks: unknown[] = [];
  let stopReason: LLMResponse['stopReason'] = 'end_turn';

  let currentToolUse: { id: string; name: string; inputJson: string } | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data) as StreamEvent;
          const result = processStreamEvent(event, onToken, currentToolUse);

          if (result.text) {
            fullText += result.text;
          }
          if (result.toolUse) {
            toolUseBlocks.push(result.toolUse);
            rawContentBlocks.push({
              type: 'tool_use',
              id: result.toolUse.id,
              name: result.toolUse.name,
              input: result.toolUse.input,
            });
            currentToolUse = null;
          }
          if (result.currentToolUse !== undefined) {
            currentToolUse = result.currentToolUse;
          }
          if (result.stopReason) {
            stopReason = result.stopReason;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (fullText) {
    rawContentBlocks.unshift({ type: 'text', text: fullText });
  }

  return {
    text: fullText || undefined,
    toolUse: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
    stopReason,
    rawContent: rawContentBlocks.length > 0 ? rawContentBlocks : undefined,
  };
}

function processStreamEvent(
  event: StreamEvent,
  onToken: StreamCallback,
  currentToolUse: { id: string; name: string; inputJson: string } | null,
): StreamEventResult {
  switch (event.type) {
    case 'content_block_start': {
      if (event.content_block.type === 'tool_use') {
        return {
          currentToolUse: {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          },
        };
      }
      return {};
    }

    case 'content_block_delta': {
      if (event.delta.type === 'text_delta') {
        onToken(event.delta.text);
        return { text: event.delta.text };
      }
      if (event.delta.type === 'input_json_delta' && currentToolUse) {
        return {
          currentToolUse: {
            ...currentToolUse,
            inputJson: currentToolUse.inputJson + event.delta.partial_json,
          },
        };
      }
      return {};
    }

    case 'content_block_stop': {
      if (currentToolUse) {
        try {
          const input = JSON.parse(currentToolUse.inputJson) as Record<string, unknown>;
          return {
            toolUse: {
              id: currentToolUse.id,
              name: currentToolUse.name,
              input,
            },
            currentToolUse: null,
          };
        } catch {
          return { currentToolUse: null };
        }
      }
      return {};
    }

    case 'message_delta': {
      const reason = event.delta.stop_reason;
      return {
        stopReason:
          reason === 'tool_use' ? 'tool_use' : reason === 'max_tokens' ? 'max_tokens' : 'end_turn',
      };
    }

    default:
      return {};
  }
}
