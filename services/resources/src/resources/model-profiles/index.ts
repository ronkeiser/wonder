/** ModelProfiles RPC resource */

import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { modelProfiles } from '~/schema';
import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { computeContentHash } from '~/shared/fingerprint';
import { Resource } from '~/shared/resource';
import {
  getByIdAndVersion,
  getByReferenceAndHash,
  getLatestByReference,
  getMaxVersion,
  deleteById,
} from '~/shared/versioning';
import type { ModelProfile, ModelProfileInput, ModelProvider } from './types';

function hashableContent(data: ModelProfileInput): Record<string, unknown> {
  return {
    name: data.name,
    provider: data.provider,
    modelId: data.modelId,
    parameters: data.parameters ?? {},
    executionConfig: data.executionConfig ?? null,
    costPer1kInputTokens: data.costPer1kInputTokens ?? 0,
    costPer1kOutputTokens: data.costPer1kOutputTokens ?? 0,
  };
}

export class ModelProfiles extends Resource {
  async create(data: ModelProfileInput & { autoversion?: boolean; force?: boolean }): Promise<{
    modelProfileId: string;
    modelProfile: ModelProfile;
    reused: boolean;
    version: number;
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'model_profile.create.started',
      metadata: { name: data.name, provider: data.provider, autoversion: data.autoversion ?? false },
    });

    const reference = data.reference ?? data.name;
    const contentHash = await computeContentHash(hashableContent(data));

    if (data.autoversion && !data.force) {
      const existing = await getByReferenceAndHash(
        this.serviceCtx.db, modelProfiles, reference, contentHash,
      );

      if (existing) {
        const latestVersion = await getMaxVersion(this.serviceCtx.db, modelProfiles, reference);
        return {
          modelProfileId: existing.id,
          modelProfile: existing,
          reused: true,
          version: existing.version,
          latestVersion,
        };
      }
    }

    const maxVersion = await getMaxVersion(this.serviceCtx.db, modelProfiles, reference);
    const version = (data.autoversion || data.force) ? maxVersion + 1 : 1;

    let stableId: string;
    if (maxVersion > 0) {
      const latest = await getLatestByReference(this.serviceCtx.db, modelProfiles, reference);
      stableId = latest?.id ?? ulid();
    } else {
      stableId = ulid();
    }

    const now = new Date().toISOString();

    try {
      const [modelProfile] = await this.serviceCtx.db
        .insert(modelProfiles)
        .values({
          id: stableId,
          version,
          reference,
          name: data.name,
          description: '',
          contentHash,
          provider: data.provider,
          modelId: data.modelId,
          parameters: data.parameters ?? {},
          executionConfig: data.executionConfig ?? null,
          costPer1kInputTokens: data.costPer1kInputTokens ?? 0,
          costPer1kOutputTokens: data.costPer1kOutputTokens ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        modelProfileId: modelProfile.id,
        modelProfile,
        reused: false,
        version: modelProfile.version,
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
  }

  async get(id: string, version?: number): Promise<{ modelProfile: ModelProfile }> {
    return this.withLogging(
      'get',
      { metadata: { modelProfileId: id, version } },
      async () => {
        const modelProfile = await getByIdAndVersion(this.serviceCtx.db, modelProfiles, id, version);

        if (!modelProfile) {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'modelProfile', id);
        }

        return { modelProfile };
      },
    );
  }

  async list(params?: { limit?: number; provider?: ModelProvider; name?: string }): Promise<{
    modelProfiles: ModelProfile[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      if (params?.name) {
        const modelProfile = await getLatestByReference(
          this.serviceCtx.db, modelProfiles, params.name,
        );
        return { modelProfiles: modelProfile ? [modelProfile] : [] };
      }

      const query = this.serviceCtx.db
        .select()
        .from(modelProfiles);

      if (params?.provider) {
        const results = await query
          .where(eq(modelProfiles.provider, params.provider))
          .limit(params?.limit ?? 100)
          .all();
        return { modelProfiles: results };
      }

      const results = await query
        .limit(params?.limit ?? 100)
        .all();

      return { modelProfiles: results };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { metadata: { modelProfileId: id, version } },
      async () => {
        const existing = await getByIdAndVersion(this.serviceCtx.db, modelProfiles, id, version);

        if (!existing) {
          throw new NotFoundError(`ModelProfile not found: ${id}`, 'modelProfile', id);
        }

        await deleteById(this.serviceCtx.db, modelProfiles, id, version);
        return { success: true };
      },
    );
  }
}
