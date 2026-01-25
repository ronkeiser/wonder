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
  systemPrompt?: string;
  template: string;
  requires: Record<string, unknown>;
  produces: JSONSchema;
  examples?: Record<string, unknown>;
  tags?: string[];
}): EmbeddedPromptSpec {
  return {
    [PROMPT_SPEC]: true,
    name: config.name,
    description: config.description,
    version: config.version ?? 1,
    systemPrompt: config.systemPrompt,
    template: config.template,
    requires: config.requires,
    produces: config.produces,
    examples: config.examples,
    tags: config.tags,
  };
}
