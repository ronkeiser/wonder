/**
 * LLM Module
 *
 * Routes LLM calls to provider-specific adapters.
 * Currently supports Anthropic; add new providers as separate adapter files.
 */

// Re-export types
export type {
  LLMRawRequest,
  LLMRequest,
  LLMResponse,
  LLMToolSpec,
  LLMToolUse,
  Message,
  MessageRole,
  StreamCallback,
} from './types';

// Re-export Anthropic adapter functions
// When adding new providers, route based on model or configuration
export { callLLM, callLLMRaw, callLLMWithStreaming } from './anthropic';
