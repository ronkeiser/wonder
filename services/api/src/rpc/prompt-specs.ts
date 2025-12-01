import * as aiService from '~/domains/ai/service';
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
    const promptSpec = await aiService.createPromptSpec(this.serviceCtx, data);
    return {
      prompt_spec_id: promptSpec.id,
      prompt_spec: promptSpec,
    };
  }

  /**
   * Get a prompt spec by ID
   */
  async get(promptSpecId: string) {
    const promptSpec = await aiService.getPromptSpec(this.serviceCtx, promptSpecId);
    return { prompt_spec: promptSpec };
  }

  /**
   * Delete a prompt spec
   */
  async delete(promptSpecId: string) {
    await aiService.deletePromptSpec(this.serviceCtx, promptSpecId);
    return { success: true };
  }
}
