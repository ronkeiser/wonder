/** ModelProfiles RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';

type ModelProvider = 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';

export class ModelProfiles extends Resource {
  async create(data: {
    name: string;
    provider: ModelProvider;
    model_id: string;
    parameters?: unknown;
    execution_config?: unknown;
    cost_per_1k_input_tokens?: number;
    cost_per_1k_output_tokens?: number;
  }): Promise<{
    model_profile_id: string;
    model_profile: {
      id: string;
      name: string;
      provider: ModelProvider;
      model_id: string;
      parameters: unknown;
      execution_config: unknown;
      cost_per_1k_input_tokens: number;
      cost_per_1k_output_tokens: number;
    };
  }> {
    this.serviceCtx.logger.info({
      event_type: 'model_profile_create_started',
      metadata: { name: data.name, provider: data.provider },
    });

    try {
      const profile = await repo.createModelProfile(this.serviceCtx.db, {
        name: data.name,
        provider: data.provider,
        model_id: data.model_id,
        parameters: data.parameters ?? null,
        execution_config: data.execution_config ?? null,
        cost_per_1k_input_tokens: data.cost_per_1k_input_tokens ?? 0,
        cost_per_1k_output_tokens: data.cost_per_1k_output_tokens ?? 0,
      });

      this.serviceCtx.logger.info({
        event_type: 'model_profile_created',
        metadata: { model_profile_id: profile.id, name: profile.name },
      });

      return {
        model_profile_id: profile.id,
        model_profile: profile,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          event_type: 'model_profile_create_conflict',
          metadata: { name: data.name, field: dbError.field },
        });
        throw new ConflictError(
          `ModelProfile with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error({
        event_type: 'model_profile_create_failed',
        message: dbError.message,
        metadata: { name: data.name },
      });
      throw error;
    }
  }

  async get(id: string): Promise<{
    model_profile: {
      id: string;
      name: string;
      provider: ModelProvider;
      model_id: string;
      parameters: unknown;
      execution_config: unknown;
      cost_per_1k_input_tokens: number;
      cost_per_1k_output_tokens: number;
    };
  }> {
    this.serviceCtx.logger.info({
      event_type: 'model_profile_get',
      metadata: { model_profile_id: id },
    });

    const profile = await repo.getModelProfile(this.serviceCtx.db, id);
    if (!profile) {
      this.serviceCtx.logger.warn({
        event_type: 'model_profile_not_found',
        metadata: { model_profile_id: id },
      });
      throw new NotFoundError(`ModelProfile not found: ${id}`, 'model_profile', id);
    }

    return { model_profile: profile };
  }

  async list(params?: { limit?: number; provider?: ModelProvider }): Promise<{
    model_profiles: Array<{
      id: string;
      name: string;
      provider: ModelProvider;
      model_id: string;
      parameters: unknown;
      execution_config: unknown;
      cost_per_1k_input_tokens: number;
      cost_per_1k_output_tokens: number;
    }>;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'model_profile_list',
      metadata: params,
    });

    const profiles = params?.provider
      ? await repo.listModelProfilesByProvider(this.serviceCtx.db, params.provider, params.limit)
      : await repo.listModelProfiles(this.serviceCtx.db, params?.limit);

    return { model_profiles: profiles };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info({
      event_type: 'model_profile_delete_started',
      metadata: { model_profile_id: id },
    });

    // Verify model profile exists
    const profile = await repo.getModelProfile(this.serviceCtx.db, id);
    if (!profile) {
      this.serviceCtx.logger.warn({
        event_type: 'model_profile_not_found',
        metadata: { model_profile_id: id },
      });
      throw new NotFoundError(`ModelProfile not found: ${id}`, 'model_profile', id);
    }

    await repo.deleteModelProfile(this.serviceCtx.db, id);
    this.serviceCtx.logger.info({
      event_type: 'model_profile_deleted',
      metadata: { model_profile_id: id },
    });

    return { success: true };
  }
}
