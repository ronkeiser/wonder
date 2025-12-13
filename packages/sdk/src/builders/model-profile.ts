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

/**
 * Create a model profile
 *
 * @example
 * // Standalone
 * const myModel = modelProfile({
 *   name: 'GPT-4 Default',
 *   provider: 'openai',
 *   model_id: 'gpt-4',
 *   parameters: { temperature: 0.7, max_tokens: 1024 }
 * });
 *
 * // Or embed in action for automatic creation
 * const myAction = action({
 *   implementation: {
 *     model_profile: modelProfile({...}),  // will be created automatically
 *     ...
 *   }
 * });
 */
export function modelProfile(config: {
  name: string;
  provider: ModelProvider;
  model_id: string;
  parameters: Record<string, unknown>;
  execution_config?: Record<string, unknown>;
  cost_per_1k_input_tokens?: number;
  cost_per_1k_output_tokens?: number;
}): EmbeddedModelProfile {
  return {
    [MODEL_PROFILE]: true,
    name: config.name,
    provider: config.provider,
    model_id: config.model_id,
    parameters: config.parameters,
    execution_config: config.execution_config,
    cost_per_1k_input_tokens: config.cost_per_1k_input_tokens ?? 0,
    cost_per_1k_output_tokens: config.cost_per_1k_output_tokens ?? 0,
  };
}
