/** PromptSpecs RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { PromptSpec } from './types';

export class PromptSpecs extends Resource {
  async create(data: {
    version?: number;
    name: string;
    description?: string;
    system_prompt?: string;
    template: string;
    requires?: object;
    produces?: object;
    examples?: object;
    tags?: string[];
    autoversion?: boolean;
  }): Promise<{
    prompt_spec_id: string;
    prompt_spec: PromptSpec;
    /** True if an existing prompt spec was reused (autoversion matched content hash) */
    reused: boolean;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'prompt_spec.create.started',
      metadata: { name: data.name, autoversion: data.autoversion ?? false },
    });

    const autoversionResult = await this.withAutoversion(data, {
      findByNameAndHash: (name, hash) =>
        repo.getPromptSpecByNameAndHash(this.serviceCtx.db, name, hash),
      getMaxVersion: (name) => repo.getMaxVersionByName(this.serviceCtx.db, name),
    });

    if (autoversionResult.reused) {
      return {
        prompt_spec_id: autoversionResult.entity.id,
        prompt_spec: autoversionResult.entity,
        reused: true,
      };
    }

    const version = data.autoversion ? autoversionResult.version : (data.version ?? 1);

    try {
      const promptSpec = await repo.createPromptSpec(this.serviceCtx.db, {
        version,
        name: data.name,
        description: data.description ?? '',
        system_prompt: data.system_prompt ?? null,
        template: data.template,
        requires: data.requires ?? {},
        produces: data.produces ?? {},
        examples: data.examples ?? null,
        tags: data.tags ?? null,
        content_hash: autoversionResult.contentHash,
      });

      return {
        prompt_spec_id: promptSpec.id,
        prompt_spec: promptSpec,
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
    prompt_spec: PromptSpec;
  }> {
    return this.withLogging(
      'get',
      { prompt_spec_id: id, version, metadata: { prompt_spec_id: id, version } },
      async () => {
        const promptSpec =
          version !== undefined
            ? await repo.getPromptSpecVersion(this.serviceCtx.db, id, version)
            : await repo.getLatestPromptSpec(this.serviceCtx.db, id);

        if (!promptSpec) {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'prompt_spec',
            id,
          );
        }

        return { prompt_spec: promptSpec };
      },
    );
  }

  async list(params?: { limit?: number }): Promise<{
    prompt_specs: Array<{
      id: string;
      name: string;
      description: string;
      version: number;
      system_prompt: string | null;
      template: string;
      requires: object;
      produces: object;
      examples: object | null;
      tags: string[] | null;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const promptSpecs = await repo.listPromptSpecs(this.serviceCtx.db, params?.limit);
      return { prompt_specs: promptSpecs };
    });
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { prompt_spec_id: id, version, metadata: { prompt_spec_id: id, version } },
      async () => {
        const promptSpec =
          version !== undefined
            ? await repo.getPromptSpecVersion(this.serviceCtx.db, id, version)
            : await repo.getPromptSpec(this.serviceCtx.db, id);

        if (!promptSpec) {
          throw new NotFoundError(
            `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
            'prompt_spec',
            id,
          );
        }

        await repo.deletePromptSpec(this.serviceCtx.db, id, version);
        return { success: true };
      },
    );
  }
}
