import * as aiService from '~/domains/ai/service';
import { Resource } from './resource';

/**
 * ModelProfiles RPC resource
 * Exposes model profile operations
 */
export class ModelProfiles extends Resource {
  /**
   * List all model profiles, optionally filtered by provider
   */
  async list(filters?: { provider?: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local' }) {
    const profiles = await aiService.listModelProfiles(this.serviceCtx, filters);
    return { model_profiles: profiles };
  }

  /**
   * Get a model profile by ID
   */
  async get(modelProfileId: string) {
    const profile = await aiService.getModelProfile(this.serviceCtx, modelProfileId);
    return { model_profile: profile };
  }

  /**
   * Create a new model profile
   */
  async create(data: {
    name: string;
    provider: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';
    model_id: string;
    parameters?: unknown;
    execution_config?: unknown;
    cost_per_1k_input_tokens?: number;
    cost_per_1k_output_tokens?: number;
  }) {
    const profile = await aiService.createModelProfile(this.serviceCtx, data);
    return {
      model_profile_id: profile.id,
      model_profile: profile,
    };
  }

  /**
   * Delete a model profile
   */
  async delete(modelProfileId: string) {
    await aiService.deleteModelProfile(this.serviceCtx, modelProfileId);
    return { success: true };
  }
}
