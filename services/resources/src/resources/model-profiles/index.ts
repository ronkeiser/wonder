/** ModelProfiles RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';
import type { ModelId, ModelProfile } from './types.js';

type ModelProvider = 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';

export class ModelProfiles extends Resource {
  async create(data: {
    name: string;
    provider: ModelProvider;
    model_id: ModelId;
    parameters?: object;
    execution_config?: object;
    cost_per_1k_input_tokens?: number;
    cost_per_1k_output_tokens?: number;
  }): Promise<{
    model_profile_id: string;
    model_profile: {
      id: string;
      name: string;
      provider: ModelProvider;
      model_id: ModelId;
      parameters: object | null;
      execution_config: object | null;
      cost_per_1k_input_tokens: number;
      cost_per_1k_output_tokens: number;
    };
  }> {
    return this.withLogging(
      'create',
      { metadata: { name: data.name, provider: data.provider } },
      async () => {
        try {
          const profile = await repo.createModelProfile(this.serviceCtx.db, {
            name: data.name,
            provider: data.provider,
            model_id: data.model_id,
            parameters: (data.parameters ?? {}) as object,
            execution_config: data.execution_config ?? null,
            cost_per_1k_input_tokens: data.cost_per_1k_input_tokens ?? 0,
            cost_per_1k_output_tokens: data.cost_per_1k_output_tokens ?? 0,
          });

          return {
            model_profile_id: profile.id,
            model_profile: profile,
          };
        } catch (error) {
          const dbError = extractDbError(error);

          if (dbError.constraint === 'unique') {
            throw new ConflictError(
              `ModelProfile with ${dbError.field} already exists`,
              dbError.field,
              'unique',
            );
          }

          throw error;
        }
      },
    );
  }

  async get(id: string): Promise<{
    model_profile: ModelProfile;
  }> {
    return this.withLogging(
      'get',
      { model_profile_id: id, metadata: { model_profile_id: id } },
      async () => {
        const profile = await repo.getModelProfile(this.serviceCtx.db, id);
        if (!profile) {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'model_profile', id);
        }
        return { model_profile: profile as ModelProfile };
      },
    );
  }

  async list(params?: { limit?: number; provider?: ModelProvider }): Promise<{
    model_profiles: Array<{
      id: string;
      name: string;
      provider: ModelProvider;
      model_id: ModelId;
      parameters: object | null;
      execution_config: object | null;
      cost_per_1k_input_tokens: number;
      cost_per_1k_output_tokens: number;
    }>;
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const profiles = params?.provider
        ? await repo.listModelProfilesByProvider(this.serviceCtx.db, params.provider, params.limit)
        : await repo.listModelProfiles(this.serviceCtx.db, params?.limit);

      return { model_profiles: profiles };
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { model_profile_id: id, metadata: { model_profile_id: id } },
      async () => {
        const profile = await repo.getModelProfile(this.serviceCtx.db, id);
        if (!profile) {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'model_profile', id);
        }

        await repo.deleteModelProfile(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
