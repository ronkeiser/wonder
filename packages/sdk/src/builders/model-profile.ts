/**
 * Model profile builder - Ergonomic helper for creating model profiles
 *
 * Returns a plain typed object that matches CreateModelProfile.
 * When used with createWorkflow, can be embedded in actions for automatic creation.
 */

import type { components } from '../generated/schema';
import { type EmbeddedModelProfile, MODEL_PROFILE } from './embedded';

type CreateModelProfile = components['schemas']['CreateModelProfile'];

type ModelProvider = 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';

type ModelId =
  | '@cf/meta/llama-4-scout-17b-16e-instruct'
  | '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  | '@cf/openai/gpt-oss-120b'
  | '@cf/openai/gpt-oss-20b'
  | 'anthropic-dummy'
  | 'openai-dummy'
  | 'google-dummy'
  | 'local-dummy';

/**
 * Create a model profile
 *
 * @example
 * // Standalone
 * const myModel = modelProfile({
 *   name: 'GPT-4 Default',
 *   provider: 'openai',
 *   modelId: 'gpt-4',
 *   parameters: { temperature: 0.7, maxTokens: 1024 }
 * });
 *
 * // Or embed in action for automatic creation
 * const myAction = action({
 *   implementation: {
 *     modelProfile: modelProfile({...}),  // will be created automatically
 *     ...
 *   }
 * });
 */
export function modelProfile(config: {
  name: string;
  provider: ModelProvider;
  modelId: ModelId;
  parameters: Record<string, unknown>;
  executionConfig?: Record<string, unknown>;
  costPer1kInputTokens?: number;
  costPer1kOutputTokens?: number;
}): EmbeddedModelProfile {
  return {
    [MODEL_PROFILE]: true,
    name: config.name,
    provider: config.provider,
    modelId: config.modelId,
    parameters: config.parameters,
    executionConfig: config.executionConfig,
    costPer1kInputTokens: config.costPer1kInputTokens ?? 0,
    costPer1kOutputTokens: config.costPer1kOutputTokens ?? 0,
  };
}
