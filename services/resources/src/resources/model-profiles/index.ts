/** ModelProfiles RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { ModelId, ModelProfile, ModelProfileInput, ModelProvider } from './types';

export class ModelProfiles extends Resource {
  async create(data: ModelProfileInput): Promise<{
    modelProfileId: string;
    modelProfile: ModelProfile;
  }> {
    return this.withLogging(
      'create',
      { metadata: { name: data.name, provider: data.provider } },
      async () => {
        try {
          const profile = await repo.createModelProfile(this.serviceCtx.db, data);

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
    modelProfiles: ModelProfile[];
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
      { modelProfileId: id, metadata: { modelProfileId: id } },
      async () => {
        const profile = await repo.getModelProfile(this.serviceCtx.db, id);
        if (!profile) {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'modelProfile', id);
        }

        await repo.deleteModelProfile(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
