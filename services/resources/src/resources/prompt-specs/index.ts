/** PromptSpecs RPC resource */

import { ulid } from 'ulid';
import { promptSpecs } from '~/schema';
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
import type { PromptSpec, PromptSpecInput } from './types';

function hashableContent(data: PromptSpecInput): Record<string, unknown> {
  return {
    name: data.name,
    systemPrompt: data.systemPrompt ?? null,
    template: data.template,
    requires: data.requires ?? {},
    produces: data.produces ?? {},
    examples: data.examples ?? null,
  };
}

export class PromptSpecs extends Resource {
  async create(data: PromptSpecInput): Promise<{
    promptSpecId: string;
    promptSpec: PromptSpec;
    reused: boolean;
    version: number;
    latestVersion?: number;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'prompt_spec.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const reference = data.name;
    const contentHash = await computeContentHash(hashableContent(data));

    if (data.autoversion && !data.force) {
      const existing = await getByReferenceAndHash(
        this.serviceCtx.db, promptSpecs, reference, contentHash,
      );

      if (existing) {
        const latestVersion = await getMaxVersion(this.serviceCtx.db, promptSpecs, reference);
        return {
          promptSpecId: existing.id,
          promptSpec: existing,
          reused: true,
          version: existing.version,
          latestVersion,
        };
      }
    }

    const maxVersion = await getMaxVersion(this.serviceCtx.db, promptSpecs, reference);
    const version = (data.autoversion || data.force) ? maxVersion + 1 : 1;

    let stableId: string;
    if (maxVersion > 0) {
      const latest = await getLatestByReference(this.serviceCtx.db, promptSpecs, reference);
      stableId = latest?.id ?? ulid();
    } else {
      stableId = ulid();
    }

    const now = new Date().toISOString();

    try {
      const [promptSpec] = await this.serviceCtx.db
        .insert(promptSpecs)
        .values({
          id: stableId,
          version,
          reference,
          name: data.name,
          description: data.description ?? '',
          contentHash,
          systemPrompt: data.systemPrompt ?? null,
          template: data.template,
          requires: data.requires ?? {},
          produces: data.produces ?? {},
          examples: data.examples ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        promptSpecId: promptSpec.id,
        promptSpec,
        reused: false,
        version: promptSpec.version,
      };
    } catch (error) {
      const dbError = extractDbError(error);
      if (dbError.constraint === 'unique') {
        throw new ConflictError(
          `PromptSpec with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }
      throw error;
    }
  }

  async get(id: string, version?: number): Promise<{ promptSpec: PromptSpec }> {
    return this.withLogging(
      'get',
      { metadata: { promptSpecId: id, version } },
      async () => {
        const promptSpec = await getByIdAndVersion(this.serviceCtx.db, promptSpecs, id, version);

        if (!promptSpec) {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'promptSpec',
            id,
          );
        }

        return { promptSpec };
      },
    );
  }

  async list(params?: { limit?: number; name?: string }): Promise<{ promptSpecs: PromptSpec[] }> {
    return this.withLogging('list', { metadata: params }, async () => {
      if (params?.name) {
        const promptSpec = await getLatestByReference(
          this.serviceCtx.db, promptSpecs, params.name,
        );
        return { promptSpecs: promptSpec ? [promptSpec] : [] };
      }

      const results = await this.serviceCtx.db
        .select()
        .from(promptSpecs)
        .limit(params?.limit ?? 100)
        .all();

      return { promptSpecs: results };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { metadata: { promptSpecId: id, version } },
      async () => {
        const existing = await getByIdAndVersion(this.serviceCtx.db, promptSpecs, id, version);

        if (!existing) {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'promptSpec',
            id,
          );
        }

        await deleteById(this.serviceCtx.db, promptSpecs, id, version);
        return { success: true };
      },
    );
  }
}
