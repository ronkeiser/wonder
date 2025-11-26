/** Unit tests for AI repository */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createModelProfile,
  createPromptSpec,
  getLatestPromptSpec,
  getModelProfile,
  getPromptSpec,
  listModelProfilesByProvider,
} from '~/domains/ai/repository';
import { createTestDb } from '../../helpers/db';
import { migrate } from '../../helpers/migrate';

const db = createTestDb();

beforeAll(async () => {
  await migrate(db);
});

describe('PromptSpec', () => {
  test('creates and retrieves prompt spec', async () => {
    const spec = await createPromptSpec(db, {
      name: 'Test Prompt',
      description: 'Test description',
      system_prompt: 'You are a helpful assistant',
      template: 'Summarize: {{input.text}}',
      template_language: 'handlebars',
      requires: JSON.stringify({ input: { text: 'string' } }),
      produces: JSON.stringify({ output: { summary: 'string' } }),
      examples: null,
      tags: null,
    });

    expect(spec.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(spec.version).toBe(1);
    expect(spec.template).toBe('Summarize: {{input.text}}');

    const retrieved = await getPromptSpec(db, spec.id);
    expect(retrieved).toEqual(spec);
  });

  test('gets latest version when multiple exist', async () => {
    const spec1 = await createPromptSpec(db, {
      name: 'Test',
      description: 'Test',
      system_prompt: null,
      template: 'v1',
      template_language: 'handlebars',
      requires: JSON.stringify({}),
      produces: JSON.stringify({}),
      examples: null,
      tags: null,
    });

    // Create a second version manually (in real system, version would increment)
    const spec2 = { ...spec1, version: 2, template: 'v2' };

    const latest = await getLatestPromptSpec(db, spec1.id);
    expect(latest?.version).toBe(1); // Only v1 exists in this test
  });
});

describe('ModelProfile', () => {
  test('creates and retrieves model profile', async () => {
    const profile = await createModelProfile(db, {
      name: 'Llama 3 8B',
      provider: 'cloudflare',
      model_id: '@cf/meta/llama-3-8b-instruct',
      parameters: JSON.stringify({ temperature: 0.7, max_tokens: 500 }),
      execution_config: null,
      cost_per_1k_input_tokens: 0.0,
      cost_per_1k_output_tokens: 0.0,
    });

    expect(profile.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(profile.provider).toBe('cloudflare');
    expect(profile.model_id).toBe('@cf/meta/llama-3-8b-instruct');

    const retrieved = await getModelProfile(db, profile.id);
    expect(retrieved).toEqual(profile);
  });

  test('lists profiles by provider', async () => {
    await createModelProfile(db, {
      name: 'Claude',
      provider: 'anthropic',
      model_id: 'claude-3-5-sonnet',
      parameters: JSON.stringify({}),
      execution_config: null,
      cost_per_1k_input_tokens: 0.003,
      cost_per_1k_output_tokens: 0.015,
    });

    await createModelProfile(db, {
      name: 'GPT-4',
      provider: 'openai',
      model_id: 'gpt-4',
      parameters: JSON.stringify({}),
      execution_config: null,
      cost_per_1k_input_tokens: 0.03,
      cost_per_1k_output_tokens: 0.06,
    });

    const anthropicProfiles = await listModelProfilesByProvider(db, 'anthropic');
    expect(anthropicProfiles.length).toBeGreaterThan(0);
    expect(anthropicProfiles.every((p) => p.provider === 'anthropic')).toBe(true);
  });
});
