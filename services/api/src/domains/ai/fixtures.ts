/** Test fixtures for AI domain */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { createModelProfile, createPromptSpec } from './repository';

type PromptSpec = Awaited<ReturnType<typeof createPromptSpec>>;
type ModelProfile = Awaited<ReturnType<typeof createModelProfile>>;

export async function buildPromptSpec(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createPromptSpec>[1]>,
): Promise<PromptSpec> {
  return await createPromptSpec(db, {
    name: 'Test Prompt',
    description: 'Test prompt description',
    system_prompt: null,
    template: 'Summarize: {{input.text}}',
    template_language: 'handlebars',
    requires: JSON.stringify({ input: { text: 'string' } }),
    produces: JSON.stringify({ output: { summary: 'string' } }),
    examples: null,
    tags: null,
    ...overrides,
  });
}

export async function buildModelProfile(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createModelProfile>[1]>,
): Promise<ModelProfile> {
  return await createModelProfile(db, {
    name: 'Test Model',
    provider: 'cloudflare',
    model_id: '@cf/meta/llama-3-8b-instruct',
    parameters: JSON.stringify({ temperature: 0.7, max_tokens: 500 }),
    execution_config: null,
    cost_per_1k_input_tokens: 0.0,
    cost_per_1k_output_tokens: 0.0,
    ...overrides,
  });
}
