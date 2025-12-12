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
    requires?: object;
    produces?: object;
    examples?: object;
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
      requires: object;
      produces: object;
      examples: object | null;
      tags: string[] | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging(
      'create',
      { metadata: { name: data.name, version: data.version } },
      async () => {
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

          return {
            prompt_spec_id: promptSpec.id,
            prompt_spec: promptSpec,
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
      },
    );
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
      requires: object;
      produces: object;
      examples: object | null;
      tags: string[] | null;
      created_at: string;
      updated_at: string;
    };
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
