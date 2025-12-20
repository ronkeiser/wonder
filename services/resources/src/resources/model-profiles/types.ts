/** Type definitions for model profiles */

/**
 * Model-specific parameter types for Cloudflare Workers AI models
 */

/**
 * Llama 4 Scout 17B model parameters
 * Model ID: @cf/meta/llama-4-scout-17b-16e-instruct
 * Docs: https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/
 */
export type Llama4Scout17BParameters = {
  temperature?: number; // Default: 0.15, Range: 0-5
  max_tokens?: number; // Default: 256
  top_p?: number; // Range: 0-2
  top_k?: number; // Range: 1-50
  seed?: number; // Range: 1-9999999999
  repetition_penalty?: number; // Range: 0-2
  frequency_penalty?: number; // Range: 0-2
  presence_penalty?: number; // Range: 0-2
  guided_json?: object; // JSON schema for response format
  response_format?: {
    type?: 'json_object' | 'json_schema';
    json_schema?: unknown;
  };
  raw?: boolean; // If true, no chat template applied
  stream?: boolean; // If true, SSE streaming
};

/**
 * Llama 3.3 70B FP8 Fast model parameters
 * Model ID: @cf/meta/llama-3.3-70b-instruct-fp8-fast
 * Docs: https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
 */
export type Llama33_70BParameters = {
  temperature?: number; // Default: 0.6, Range: 0-5
  max_tokens?: number; // Default: 256
  top_p?: number; // Range: 0.001-1
  top_k?: number; // Range: 1-50
  seed?: number; // Range: 1-9999999999
  repetition_penalty?: number; // Range: 0-2
  frequency_penalty?: number; // Range: -2 to 2
  presence_penalty?: number; // Range: -2 to 2
  lora?: string; // LoRA model name for fine-tuning
  response_format?: {
    type?: 'json_object' | 'json_schema';
    json_schema?: unknown;
  };
  raw?: boolean; // If true, no chat template applied
  stream?: boolean; // If true, SSE streaming
};

/**
 * GPT-OSS 120B model parameters
 * Model ID: @cf/openai/gpt-oss-120b
 * Docs: https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
 * Note: Uses OpenAI Responses API format
 */
export type GptOss120BParameters = {
  reasoning?: {
    effort?: 'low' | 'medium' | 'high'; // Constrains reasoning effort
    summary?: 'auto' | 'concise' | 'detailed'; // Reasoning summary format
  };
};

/**
 * GPT-OSS 20B model parameters
 * Model ID: @cf/openai/gpt-oss-20b
 * Docs: https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/
 * Note: Uses OpenAI Responses API format
 */
export type GptOss20BParameters = {
  reasoning?: {
    effort?: 'low' | 'medium' | 'high'; // Constrains reasoning effort
    summary?: 'auto' | 'concise' | 'detailed'; // Reasoning summary format
  };
};

/**
 * Dummy Anthropic model parameters (for testing/future use)
 */
export type AnthropicDummyParameters = {
  temperature?: number;
  max_tokens?: number;
};

/**
 * Dummy OpenAI model parameters (for testing/future use)
 */
export type OpenAIDummyParameters = {
  temperature?: number;
  max_tokens?: number;
};

/**
 * Dummy Google model parameters (for testing/future use)
 */
export type GoogleDummyParameters = {
  temperature?: number;
  max_tokens?: number;
};

/**
 * Dummy local model parameters (for testing/future use)
 */
export type LocalDummyParameters = {
  temperature?: number;
  max_tokens?: number;
};

/**
 * Model catalog - single source of truth for all supported models
 * Maps model_id to provider and parameter types
 */
export const MODEL_CATALOG = {
  '@cf/meta/llama-4-scout-17b-16e-instruct': {
    provider: 'cloudflare' as const,
    parameters: {} as Llama4Scout17BParameters,
  },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
    provider: 'cloudflare' as const,
    parameters: {} as Llama33_70BParameters,
  },
  '@cf/openai/gpt-oss-120b': {
    provider: 'cloudflare' as const,
    parameters: {} as GptOss120BParameters,
  },
  '@cf/openai/gpt-oss-20b': {
    provider: 'cloudflare' as const,
    parameters: {} as GptOss20BParameters,
  },
  'anthropic-dummy': {
    provider: 'anthropic' as const,
    parameters: {} as AnthropicDummyParameters,
  },
  'openai-dummy': {
    provider: 'openai' as const,
    parameters: {} as OpenAIDummyParameters,
  },
  'google-dummy': {
    provider: 'google' as const,
    parameters: {} as GoogleDummyParameters,
  },
  'local-dummy': {
    provider: 'local' as const,
    parameters: {} as LocalDummyParameters,
  },
} as const;

/**
 * Valid model IDs derived from the catalog
 */
export type ModelId = keyof typeof MODEL_CATALOG;

/**
 * Discriminated union of model profiles derived from the catalog
 * Maps each model_id to its provider and parameter types
 */
export type ModelProfile = {
  [K in ModelId]: {
    id: string;
    name: string;
    modelId: K;
    provider: (typeof MODEL_CATALOG)[K]['provider'];
    parameters: (typeof MODEL_CATALOG)[K]['parameters'];
    executionConfig: object | null;
    costPer1kInputTokens: number;
    costPer1kOutputTokens: number;
  };
}[ModelId];

// ============================================================================
// API DTOs (inferred from schema)
// ============================================================================

import { modelProfiles } from '../../schema';
import type { NewEntity } from '~/shared/types';

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';

/** Input for creating a model profile - inferred from schema */
export type ModelProfileInput = NewEntity<typeof modelProfiles.$inferInsert>;
