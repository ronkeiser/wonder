/**
 * LLM Types
 *
 * Internal types for LLM requests and responses using our domain vocabulary.
 * Provider adapters translate these to/from provider-specific formats.
 */

// ============================================================================
// Message Types (using our domain roles)
// ============================================================================

/**
 * Message role in our domain model.
 *
 * - 'user': Message from a human user
 * - 'agent': Message from our agent (not "assistant" - that's provider vocabulary)
 */
export type MessageRole = 'user' | 'agent';

export type Message = {
  role: MessageRole;
  content: string;
};

// ============================================================================
// LLM Request (internal format)
// ============================================================================

/**
 * Base LLM request fields shared by all request types.
 */
type LLMRequestBase = {
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

/**
 * Standard LLM request using our internal message format.
 *
 * Provider adapters translate this to provider-specific formats
 * (e.g., Anthropic's messages array with 'assistant' role).
 */
export type LLMRequest = LLMRequestBase & {
  messages: Message[];
};

/**
 * Raw LLM request for tool continuation.
 *
 * Used when building continuation requests that include provider-specific
 * content like tool_use and tool_result blocks. The messages are passed
 * through to the provider without translation.
 */
export type LLMRawRequest = LLMRequestBase & {
  messages: unknown[];
};

// ============================================================================
// Tool Spec (provider-agnostic)
// ============================================================================

export type LLMToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

// ============================================================================
// LLM Response (provider-agnostic)
// ============================================================================

export type LLMToolUse = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type LLMResponse = {
  text?: string;
  toolUse?: LLMToolUse[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  /** Raw content blocks from LLM response (for tool continuation) */
  rawContent?: unknown[];
};

// ============================================================================
// Stream Callback
// ============================================================================

/**
 * Callback for streaming token delivery.
 */
export type StreamCallback = (token: string) => void;