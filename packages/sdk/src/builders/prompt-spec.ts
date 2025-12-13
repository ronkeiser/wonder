/**
 * Prompt spec builder - Ergonomic helper for creating prompt specifications
 *
 * Returns a plain typed object that matches CreatePromptSpec.
 * When used with createWorkflow, can be embedded in actions for automatic creation.
 */

import type { JSONSchema } from '@wonder/schemas';
import type { components } from '../generated/schema';
import { type EmbeddedPromptSpec, PROMPT_SPEC } from './embedded';

type CreatePromptSpec = components['schemas']['CreatePromptSpec'];

/**
 * Create a prompt specification
 *
 * @example
 * // Standalone creation
 * const myPrompt = promptSpec({
 *   name: 'Summarization Prompt',
 *   description: 'Summarizes text content',
 *   template: 'Summarize the following: {{text}}',
 *   template_language: 'handlebars',
 *   requires: { text: schema.string() },
 *   produces: schema.object({ summary: schema.string() })
 * });
 *
 * // Or embed in action for automatic creation by createWorkflow
 * const myAction = action({
 *   promptSpec: promptSpec({...}),  // will be created automatically
 *   ...
 * });
 */
export function promptSpec(config: {
  name: string;
  description: string;
  version?: number;
  system_prompt?: string;
  template: string;
  template_language: 'handlebars' | 'jinja2';
  requires: Record<string, unknown>;
  produces: JSONSchema;
  examples?: unknown[];
  tags?: string[];
}): EmbeddedPromptSpec {
  return {
    [PROMPT_SPEC]: true,
    name: config.name,
    description: config.description,
    version: config.version ?? 1,
    system_prompt: config.system_prompt,
    template: config.template,
    template_language: config.template_language,
    requires: config.requires,
    produces: config.produces,
    examples: config.examples,
    tags: config.tags,
  };
}
