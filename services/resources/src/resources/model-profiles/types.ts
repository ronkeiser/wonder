/** Type definitions for model profiles */

/**
 * Cloudflare Workers AI parameters
 * Docs: https://developers.cloudflare.com/workers-ai/configuration/
 */
export type CloudflareModelParameters = {
  temperature?: number; // Controls randomness (0.0-1.0)
  max_tokens?: number; // Maximum tokens to generate
  top_p?: number; // Nucleus sampling threshold
  top_k?: number; // Top-k sampling
  seed?: number; // Seed for reproducibility
  repetition_penalty?: number; // Penalize repeated tokens
  frequency_penalty?: number; // Penalize frequent tokens
  presence_penalty?: number; // Penalize present tokens
};

/**
 * Anthropic API parameters (placeholder)
 * TODO: Implement based on https://docs.anthropic.com/en/api/messages
 */
export type AnthropicModelParameters = {
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
};

/**
 * OpenAI API parameters (placeholder)
 * TODO: Implement based on https://platform.openai.com/docs/api-reference/chat/create
 */
export type OpenAIModelParameters = {
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
};

/**
 * Google AI parameters (placeholder)
 * TODO: Implement based on https://ai.google.dev/api/rest/v1beta/models
 */
export type GoogleModelParameters = {
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
};

/**
 * Local model parameters (placeholder)
 * TODO: Define based on local implementation
 */
export type LocalModelParameters = {
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
};

/**
 * Base model profile fields shared across all providers
 */
type BaseModelProfile = {
  id: string;
  name: string;
  model_id: string;
  execution_config: object | null;
  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
};

/**
 * Union type for all model parameters
 */
export type ModelParameters =
  | CloudflareModelParameters
  | AnthropicModelParameters
  | OpenAIModelParameters
  | GoogleModelParameters
  | LocalModelParameters;

/**
 * Discriminated union of model profiles by provider
 */
export type ModelProfile =
  | (BaseModelProfile & { provider: 'cloudflare'; parameters: CloudflareModelParameters })
  | (BaseModelProfile & { provider: 'anthropic'; parameters: AnthropicModelParameters })
  | (BaseModelProfile & { provider: 'openai'; parameters: OpenAIModelParameters })
  | (BaseModelProfile & { provider: 'google'; parameters: GoogleModelParameters })
  | (BaseModelProfile & { provider: 'local'; parameters: LocalModelParameters });
