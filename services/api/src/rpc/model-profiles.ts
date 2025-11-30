import { eq } from 'drizzle-orm';
import * as aiRepo from '~/domains/ai/repository';
import { model_profiles } from '~/infrastructure/db/schema';
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
    let profiles;

    if (filters?.provider) {
      profiles = await aiRepo.listModelProfilesByProvider(this.serviceCtx.db, filters.provider);
    } else {
      // List all profiles
      profiles = await this.serviceCtx.db.select().from(model_profiles).all();
    }

    return { profiles };
  }

  /**
   * Get a model profile by ID
   */
  async get(modelProfileId: string) {
    const profile = await aiRepo.getModelProfile(this.serviceCtx.db, modelProfileId);
    if (!profile) {
      throw new Error(`ModelProfile not found: ${modelProfileId}`);
    }
    return { profile };
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
    const profile = await aiRepo.createModelProfile(this.serviceCtx.db, {
      name: data.name,
      provider: data.provider,
      model_id: data.model_id,
      parameters: data.parameters ? JSON.stringify(data.parameters) : null,
      execution_config: data.execution_config ? JSON.stringify(data.execution_config) : null,
      cost_per_1k_input_tokens: data.cost_per_1k_input_tokens ?? 0,
      cost_per_1k_output_tokens: data.cost_per_1k_output_tokens ?? 0,
    });

    return {
      model_profile_id: profile.id,
      profile,
    };
  }

  /**
   * Delete a model profile
   */
  async delete(modelProfileId: string) {
    const profile = await aiRepo.getModelProfile(this.serviceCtx.db, modelProfileId);
    if (!profile) {
      throw new Error(`ModelProfile not found: ${modelProfileId}`);
    }

    await this.serviceCtx.db.delete(model_profiles).where(eq(model_profiles.id, modelProfileId));

    return { success: true };
  }
}
