/** ModelProfiles RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { ModelId, ModelProfile, ModelProfileInput, ModelProvider } from './types';

export class ModelProfiles extends Resource {
  async create(data: ModelProfileInput & { autoversion?: boolean }): Promise<{
    modelProfileId: string;
    modelProfile: ModelProfile;
    /** True if an existing model profile was reused (autoversion matched content hash) */
    reused: boolean;
    /** Version number of the created/reused model profile */
    version: number;
  }> {
    return this.withLogging(
      'create',
      { metadata: { name: data.name, provider: data.provider, autoversion: data.autoversion } },
      async () => {
        // Autoversion deduplication check
        const autoversionResult = await this.withAutoversion(
          data as unknown as Record<string, unknown> & { name: string; autoversion?: boolean },
          {
            findByNameAndHash: (name, hash) =>
              repo.getModelProfileByNameAndHash(this.serviceCtx.db, name, hash),
            getMaxVersion: (name) => repo.getMaxVersionByName(this.serviceCtx.db, name),
          },
        );

        if (autoversionResult.reused) {
          return {
            modelProfileId: autoversionResult.entity.id,
            modelProfile: autoversionResult.entity,
            reused: true,
            version: 1, // Model profiles don't have versioning yet
          };
        }

        try {
          const profile = await repo.createModelProfile(this.serviceCtx.db, {
            ...data,
            contentHash: autoversionResult.contentHash,
          });

          return {
            modelProfileId: profile.id,
            modelProfile: profile,
            reused: false,
            version: autoversionResult.version,
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

  async list(params?: { limit?: number; provider?: ModelProvider; name?: string }): Promise<{
    modelProfiles: ModelProfile[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      // If name is specified, find by name (efficient single-row lookup)
      if (params?.name) {
        const profile = await repo.getModelProfileByName(this.serviceCtx.db, params.name);
        return { modelProfiles: profile ? [profile] : [] };
      }

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
