/** PromptSpecs RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import { computeFingerprint } from './fingerprint';
import * as repo from './repository';
import type { PromptSpec } from './types';

export class PromptSpecs extends Resource {
  async create(data: {
    version?: number;
    name: string;
    description?: string;
    system_prompt?: string;
    template: string;
    template_language?: 'handlebars' | 'jinja2';
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

    // Autoversion deduplication check
    if (data.autoversion) {
      const contentHash = await computeFingerprint(data);

      // Check for existing prompt spec with same name + content
      const existing = await repo.getPromptSpecByNameAndHash(
        this.serviceCtx.db,
        data.name,
        contentHash,
      );

      if (existing) {
        this.serviceCtx.logger.info({
          event_type: 'prompt_spec.autoversion.matched',
          metadata: {
            prompt_spec_id: existing.id,
            version: existing.version,
            name: existing.name,
            content_hash: contentHash,
          },
        });

        return {
          prompt_spec_id: existing.id,
          prompt_spec: existing,
          reused: true,
        };
      }

      // No exact match - determine version number
      const maxVersion = await repo.getMaxVersionByName(this.serviceCtx.db, data.name);
      const newVersion = maxVersion + 1;

      this.serviceCtx.logger.info({
        event_type: 'prompt_spec.autoversion.creating',
        metadata: {
          name: data.name,
          version: newVersion,
          content_hash: contentHash,
          existing_max_version: maxVersion,
        },
      });

      return this.createWithVersionAndHash(data, newVersion, contentHash);
    }

    // Non-autoversion path: create with version 1 (original behavior)
    return this.createWithVersionAndHash(data, data.version ?? 1, null);
  }

  private async createWithVersionAndHash(
    data: {
      name: string;
      description?: string;
      system_prompt?: string;
      template: string;
      template_language?: 'handlebars' | 'jinja2';
      requires?: object;
      produces?: object;
      examples?: object;
      tags?: string[];
    },
    version: number,
    contentHash: string | null,
  ): Promise<{
    prompt_spec_id: string;
    prompt_spec: PromptSpec;
    reused: boolean;
  }> {
    try {
      const promptSpec = await repo.createPromptSpec(this.serviceCtx.db, {
        version,
        name: data.name,
        description: data.description ?? '',
        system_prompt: data.system_prompt ?? null,
        template: data.template,
        template_language: data.template_language ?? 'handlebars',
        requires: data.requires ?? {},
        produces: data.produces ?? {},
        examples: data.examples ?? null,
        tags: data.tags ?? null,
        content_hash: contentHash,
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
      template_language: 'handlebars' | 'jinja2';
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
