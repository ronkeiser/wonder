/** PromptSpecs RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { computeContentHash } from '~/shared/fingerprint';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { PromptSpec, PromptSpecInput } from './types';

export class PromptSpecs extends Resource {
  async create(data: PromptSpecInput): Promise<{
    promptSpecId: string;
    promptSpec: PromptSpec;
    /** True if an existing prompt spec was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'prompt_spec.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    // Prompt specs use name-based autoversioning (no reference field)
    const contentHash = await computeContentHash(data as Record<string, unknown>);
    let version = data.version ?? 1;

    if (data.autoversion) {
      // Check for existing prompt spec with same name + content
      const existing = await repo.getPromptSpecByNameAndHash(
        this.serviceCtx.db,
        data.name,
        contentHash,
      );

      if (existing) {
        return {
          promptSpecId: existing.id,
          promptSpec: existing,
          reused: true,
        };
      }

      // Get max version and increment
      const maxVersion = await repo.getMaxVersionByName(this.serviceCtx.db, data.name);
      version = maxVersion + 1;
    }

    try {
      const promptSpec = await repo.createPromptSpec(this.serviceCtx.db, {
        ...data,
        version,
        contentHash,
      });

      return {
        promptSpecId: promptSpec.id,
        promptSpec: promptSpec,
        reused: false,
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

  async get(
    id: string,
    version?: number,
  ): Promise<{
    promptSpec: PromptSpec;
  }> {
    return this.withLogging(
      'get',
      { promptSpecId: id, version, metadata: { promptSpecId: id, version } },
      async () => {
        const promptSpec =
          version !== undefined
            ? await repo.getPromptSpecVersion(this.serviceCtx.db, id, version)
            : await repo.getLatestPromptSpec(this.serviceCtx.db, id);

        if (!promptSpec) {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'promptSpec',
            id,
          );
        }

        return { promptSpec: promptSpec };
      },
    );
  }

  async list(params?: { limit?: number }): Promise<{
    promptSpecs: PromptSpec[];
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const promptSpecs = await repo.listPromptSpecs(this.serviceCtx.db, params?.limit);
      return { promptSpecs };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { promptSpecId: id, version, metadata: { promptSpecId: id, version } },
      async () => {
        const promptSpec =
          version !== undefined
            ? await repo.getPromptSpecVersion(this.serviceCtx.db, id, version)
            : await repo.getPromptSpec(this.serviceCtx.db, id);

        if (!promptSpec) {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'promptSpec',
            id,
          );
        }

        await repo.deletePromptSpec(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}
