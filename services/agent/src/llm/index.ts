/**
 * LLM Module
 *
 * Direct LLM calls with streaming support.
 * ConversationRunner makes LLM calls directly (not via task dispatch)
 * to enable real-time streaming to the client.
 */

import type { LLMResponse, LLMToolUse } from '../planning/response';
import type { LLMToolSpec } from '../planning/tools';
import type { LLMRequest } from '../types';

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
// LLM Call
// ============================================================================

/**
 * Call the LLM with the assembled context and tools.
 *
 * This is called directly by ConversationRunner after context assembly completes.
 * The LLM request is in provider-native format (from context assembly workflow).
 *
 * @param request - Provider-native LLM request (from context assembly)
 * @param tools - Tool specs for the LLM to use
 * @param apiKey - Anthropic API key
 * @returns LLM response with text and/or tool calls
 */
export async function callLLM(
  request: LLMRequest,
  tools: LLMToolSpec[],
  apiKey: string,
): Promise<LLMResponse> {
  // Build Anthropic request
  const anthropicRequest: AnthropicRequest = {
    model: request.model ?? 'claude-sonnet-4-20250514',
    max_tokens: request.maxTokens ?? 4096,
    messages: request.messages as AnthropicMessage[],
    temperature: request.temperature,
  };

  // Add system prompt if present
  if (request.systemPrompt) {
    anthropicRequest.system = request.systemPrompt;
  }

  // Add tools if present
  if (tools.length > 0) {
    anthropicRequest.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  // Make API call
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
// Response Parsing
// ============================================================================

function parseAnthropicResponse(response: AnthropicResponse): LLMResponse {
  // Extract text content
  const textBlocks = response.content.filter(
    (block): block is { type: 'text'; text: string } => block.type === 'text',
  );
  const text = textBlocks.map((b) => b.text).join('');

  // Extract tool use
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

  // Map stop reason
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
    // Preserve raw content blocks for tool continuation
    rawContent: response.content,
  };
}

// ============================================================================
// Streaming Support
// ============================================================================

/**
 * Stream callback for real-time token delivery.
 *
 * Called for each token as it arrives from the LLM.
 * The streaming layer will forward these to the WebSocket client.
 */
export type StreamCallback = (token: string) => void;

/**
 * Call the LLM with streaming.
 *
 * @param request - Provider-native LLM request
 * @param tools - Tool specs for the LLM
 * @param apiKey - Anthropic API key
 * @param onToken - Callback for each streamed token
 * @returns Complete LLM response after streaming finishes
 */
export async function callLLMWithStreaming(
  request: LLMRequest,
  tools: LLMToolSpec[],
  apiKey: string,
  onToken: StreamCallback,
): Promise<LLMResponse> {
  // Build Anthropic request with streaming enabled
  const anthropicRequest: AnthropicRequest & { stream: boolean } = {
    model: request.model ?? 'claude-sonnet-4-20250514',
    max_tokens: request.maxTokens ?? 4096,
    messages: request.messages as AnthropicMessage[],
    temperature: request.temperature,
    stream: true,
  };

  if (request.systemPrompt) {
    anthropicRequest.system = request.systemPrompt;
  }

  if (tools.length > 0) {
    anthropicRequest.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
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

  // Process the SSE stream
  return processAnthropicStream(response.body, onToken);
}

// ============================================================================
// Stream Processing
// ============================================================================

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

  // Track current tool use being built
  let currentToolUse: { id: string; name: string; inputJson: string } | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
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
            // Add to raw content blocks for continuation
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

  // Build final raw content (text block + tool blocks)
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

// ============================================================================
// Stream Event Types
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
          // Invalid JSON, skip this tool use
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
