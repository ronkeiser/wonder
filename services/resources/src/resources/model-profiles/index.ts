/** ModelProfiles RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { ModelId, ModelProfile } from './types';

type ModelProvider = 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';

export class ModelProfiles extends Resource {
  async create(data: {
    name: string;
    provider: ModelProvider;
    modelId: ModelId;
    parameters?: object;
    executionConfig?: object;
    costPer1kInputTokens?: number;
    costPer1kOutputTokens?: number;
  }): Promise<{
    modelProfileId: string;
    modelProfile: {
      id: string;
      name: string;
      provider: ModelProvider;
      modelId: ModelId;
      parameters: object | null;
      executionConfig: object | null;
      costPer1kInputTokens: number;
      costPer1kOutputTokens: number;
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
            modelId: data.modelId,
            parameters: (data.parameters ?? {}) as object,
            executionConfig: data.executionConfig ?? null,
            costPer1kInputTokens: data.costPer1kInputTokens ?? 0,
            costPer1kOutputTokens: data.costPer1kOutputTokens ?? 0,
          });

          return {
            modelProfileId: profile.id,
            modelProfile: profile,
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
    modelProfile: ModelProfile;
  }> {
    return this.withLogging(
      'get',
      { modelProfileId: id, metadata: { modelProfileId: id } },
      async () => {
        const profile = await repo.getModelProfile(this.serviceCtx.db, id);
        if (!profile) {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'modelProfile', id);
        }
        return { modelProfile: profile as ModelProfile };
      },
    );
  }

  async list(params?: { limit?: number; provider?: ModelProvider }): Promise<{
    modelProfiles: Array<{
      id: string;
      name: string;
      provider: ModelProvider;
      modelId: ModelId;
      parameters: object | null;
      executionConfig: object | null;
      costPer1kInputTokens: number;
      costPer1kOutputTokens: number;
    }>;
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const profiles = params?.provider
        ? await repo.listModelProfilesByProvider(this.serviceCtx.db, params.provider, params.limit)
        : await repo.listModelProfiles(this.serviceCtx.db, params?.limit);

      return { modelProfiles: profiles };
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
