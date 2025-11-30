import * as aiRepo from '~/domains/ai/repository';
import { Resource } from './resource';

/**
 * PromptSpecs RPC resource
 * Exposes prompt specification CRUD operations
 */
export class PromptSpecs extends Resource {
  /**
   * Create a new prompt spec
   */
  async create(data: {
    version: number;
    name: string;
    description: string;
    system_prompt?: string;
    template: string;
    template_language?: 'handlebars' | 'jinja2';
    requires?: unknown;
    produces?: unknown;
    examples?: unknown;
    tags?: string[];
  }) {
    const promptSpec = await aiRepo.createPromptSpec(this.serviceCtx.db, {
      version: data.version,
      name: data.name,
      description: data.description ?? '',
      system_prompt: data.system_prompt ?? null,
      template: data.template,
      template_language: data.template_language ?? 'handlebars',
      requires: JSON.stringify(data.requires ?? {}),
      produces: JSON.stringify(data.produces ?? {}),
      examples: data.examples ? JSON.stringify(data.examples) : null,
      tags: data.tags ? JSON.stringify(data.tags) : null,
    });

    return {
      prompt_spec_id: promptSpec.id,
      prompt_spec: promptSpec,
    };
  }

  /**
   * Get a prompt spec by ID
   */
  async get(promptSpecId: string) {
    const promptSpec = await aiRepo.getPromptSpec(this.serviceCtx.db, promptSpecId);
    if (!promptSpec) {
      throw new Error(`PromptSpec not found: ${promptSpecId}`);
    }
    return { prompt_spec: promptSpec };
  }

  /**
   * Delete a prompt spec
   */
  async delete(promptSpecId: string) {
    const promptSpec = await aiRepo.getPromptSpec(this.serviceCtx.db, promptSpecId);
    if (!promptSpec) {
      throw new Error(`PromptSpec not found: ${promptSpecId}`);
    }
    await aiRepo.deletePromptSpec(this.serviceCtx.db, promptSpecId);
    return { success: true };
  }
}
