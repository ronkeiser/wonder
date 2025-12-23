/**
 * Model profile builder - Ergonomic helper for creating model profiles
 *
 * Returns a plain typed object that matches CreateModelProfile.
 * When used with createWorkflow, can be embedded in actions for automatic creation.
 */

import type { components } from '../generated/schema';
import { type EmbeddedModelProfile, MODEL_PROFILE } from './embedded';

type CreateModelProfile = components['schemas']['CreateModelProfile'];

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
  name: CreateModelProfile['name'];
  provider: CreateModelProfile['provider'];
  modelId: CreateModelProfile['modelId'];
  parameters: CreateModelProfile['parameters'];
  executionConfig?: CreateModelProfile['executionConfig'];
  costPer1kInputTokens?: CreateModelProfile['costPer1kInputTokens'];
  costPer1kOutputTokens?: CreateModelProfile['costPer1kOutputTokens'];
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
