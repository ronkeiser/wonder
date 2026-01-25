/** ModelProfiles RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  getLatestDefinition,
  listDefinitions,
  type Definition,
} from '~/shared/definitions-repository';
import type { ModelProfileContent } from '~/shared/content-schemas';
import type { ModelProfile, ModelProfileInput, ModelProvider } from './types';

/**
 * Maps a Definition to the legacy ModelProfile shape for API compatibility.
 */
function toModelProfile(def: Definition): ModelProfile {
  const content = def.content as ModelProfileContent;
  // Provider is stored as string in content, but we validate it matches ModelProvider at creation time
  const provider = content.provider as ModelProvider;
  return {
    id: def.id,
    version: def.version,
    name: content.name,
    reference: def.reference,
    provider,
    modelId: content.modelId,
    parameters: content.parameters,
    executionConfig: content.executionConfig ?? null,
    costPer1kInputTokens: content.costPer1kInputTokens,
    costPer1kOutputTokens: content.costPer1kOutputTokens,
    contentHash: def.contentHash,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

export class ModelProfiles extends Resource {
  async create(data: ModelProfileInput & { autoversion?: boolean }): Promise<{
    modelProfileId: string;
    modelProfile: ModelProfile;
    /** True if an existing model profile was reused (autoversion matched content hash) */
    reused: boolean;
    /** Version number of the created/reused model profile */
    version: number;
    /** Latest version for this name (only present when reused=true) */
    latestVersion?: number;
  }> {
    return this.withLogging(
      'create',
      { metadata: { name: data.name, provider: data.provider, autoversion: data.autoversion } },
      async () => {
        // Model profiles use reference for identity (fall back to name if not provided)
        const reference = data.reference ?? data.name;

        try {
          const result = await createDefinition(this.serviceCtx.db, 'model_profile', {
            reference,
            name: data.name,
            content: {
              name: data.name,
              provider: data.provider,
              modelId: data.modelId,
              parameters: data.parameters ?? {},
              executionConfig: data.executionConfig,
              costPer1kInputTokens: data.costPer1kInputTokens ?? 0,
              costPer1kOutputTokens: data.costPer1kOutputTokens ?? 0,
            },
            autoversion: data.autoversion,
          });

          if (result.reused) {
            return {
              modelProfileId: result.definition.id,
              modelProfile: toModelProfile(result.definition),
              reused: true,
              version: result.definition.version,
              latestVersion: result.latestVersion,
            };
          }

          return {
            modelProfileId: result.definition.id,
            modelProfile: toModelProfile(result.definition),
            reused: false,
            version: result.definition.version,
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

  async get(id: string, version?: number): Promise<{
    modelProfile: ModelProfile;
  }> {
    return this.withLogging(
      'get',
      { modelProfileId: id, metadata: { modelProfileId: id, version } },
      async () => {
        const definition = await getDefinition(this.serviceCtx.db, id, version);

        if (!definition || definition.kind !== 'model_profile') {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'modelProfile', id);
        }

        return { modelProfile: toModelProfile(definition) };
      },
    );
  }

  async list(params?: { limit?: number; provider?: ModelProvider; name?: string }): Promise<{
    modelProfiles: ModelProfile[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      // If name is specified, find by reference (name is normalized to reference)
      if (params?.name) {
        const definition = await getLatestDefinition(this.serviceCtx.db, 'model_profile', params.name);
        return { modelProfiles: definition ? [toModelProfile(definition)] : [] };
      }

      const defs = await listDefinitions(this.serviceCtx.db, 'model_profile', {
        limit: params?.limit,
        latestOnly: true,
      });

      let profiles = defs.map(toModelProfile);

      // Filter by provider if specified
      if (params?.provider) {
        profiles = profiles.filter((p) => p.provider === params.provider);
      }

      return { modelProfiles: profiles };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { modelProfileId: id, metadata: { modelProfileId: id, version } },
      async () => {
        const existing = await getDefinition(this.serviceCtx.db, id, version);

        if (!existing || existing.kind !== 'model_profile') {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'modelProfile', id);
        }

        await deleteDefinition(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}
