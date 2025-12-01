/** PromptSpecs RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';

export class PromptSpecs extends Resource {
  async create(data: {
    version: number;
    name: string;
    description?: string;
    system_prompt?: string;
    template: string;
    template_language?: 'handlebars' | 'jinja2';
    requires?: unknown;
    produces?: unknown;
    examples?: unknown;
    tags?: string[];
  }): Promise<{
    prompt_spec_id: string;
    prompt_spec: {
      id: string;
      name: string;
      description: string;
      version: number;
      system_prompt: string | null;
      template: string;
      template_language: 'handlebars' | 'jinja2';
      requires: unknown;
      produces: unknown;
      examples: unknown;
      tags: unknown;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('prompt_spec_create_started', {
      name: data.name,
      version: data.version,
    });

    try {
      const promptSpec = await repo.createPromptSpec(this.serviceCtx.db, {
        version: data.version,
        name: data.name,
        description: data.description ?? '',
        system_prompt: data.system_prompt ?? null,
        template: data.template,
        template_language: data.template_language ?? 'handlebars',
        requires: data.requires ?? {},
        produces: data.produces ?? {},
        examples: data.examples ?? null,
        tags: data.tags ?? null,
      });

      this.serviceCtx.logger.info('prompt_spec_created', {
        prompt_spec_id: promptSpec.id,
        name: promptSpec.name,
      });

      return {
        prompt_spec_id: promptSpec.id,
        prompt_spec: promptSpec,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn('prompt_spec_create_conflict', {
          name: data.name,
          field: dbError.field,
        });
        throw new ConflictError(
          `PromptSpec with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error('prompt_spec_create_failed', {
        name: data.name,
        error: dbError.message,
      });
      throw error;
    }
  }

  async get(
    id: string,
    version?: number,
  ): Promise<{
    prompt_spec: {
      id: string;
      name: string;
      description: string;
      version: number;
      system_prompt: string | null;
      template: string;
      template_language: 'handlebars' | 'jinja2';
      requires: unknown;
      produces: unknown;
      examples: unknown;
      tags: unknown;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('prompt_spec_get', { prompt_spec_id: id, version });

    const promptSpec =
      version !== undefined
        ? await repo.getPromptSpecVersion(this.serviceCtx.db, id, version)
        : await repo.getLatestPromptSpec(this.serviceCtx.db, id);

    if (!promptSpec) {
      this.serviceCtx.logger.warn('prompt_spec_not_found', { prompt_spec_id: id, version });
      throw new NotFoundError(
        `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
        'prompt_spec',
        id,
      );
    }

    return { prompt_spec: promptSpec };
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
      requires: unknown;
      produces: unknown;
      examples: unknown;
      tags: unknown;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    this.serviceCtx.logger.info('prompt_spec_list', params);

    const promptSpecs = await repo.listPromptSpecs(this.serviceCtx.db, params?.limit);

    return { prompt_specs: promptSpecs };
  }

  async delete(id: string, version?: number): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info('prompt_spec_delete_started', { prompt_spec_id: id, version });

    // Verify prompt spec exists
    const promptSpec =
      version !== undefined
        ? await repo.getPromptSpecVersion(this.serviceCtx.db, id, version)
        : await repo.getPromptSpec(this.serviceCtx.db, id);

    if (!promptSpec) {
      this.serviceCtx.logger.warn('prompt_spec_not_found', { prompt_spec_id: id, version });
      throw new NotFoundError(
        `PromptSpec not found: ${id}${version !== undefined ? ` version ${version}` : ''}`,
        'prompt_spec',
        id,
      );
    }

    await repo.deletePromptSpec(this.serviceCtx.db, id, version);
    this.serviceCtx.logger.info('prompt_spec_deleted', { prompt_spec_id: id, version });

    return { success: true };
  }
}
