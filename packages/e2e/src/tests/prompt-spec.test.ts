import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('PromptSpec API', () => {
  it('should create and retrieve a prompt spec', async () => {
    // Create prompt spec
    const { data: promptSpec, error: createError } = await client.POST('/api/prompt-specs', {
      body: {
        name: `Test Prompt Spec ${Date.now()}`,
        description: 'E2E test prompt spec for text summarization',
        version: 1,
        system_prompt: 'You are a helpful assistant that summarizes text concisely.',
        template: 'Summarize the following text:\n\n{{text}}',
        template_language: 'handlebars',
        requires: {
          text: 'string',
        },
        produces: {
          summary: 'string',
        },
        tags: ['summarization', 'test'],
      },
    });

    expect(createError).toBeUndefined();
    expect(promptSpec).toBeDefined();
    expect(promptSpec!.id).toBeDefined();
    expect(promptSpec!.name).toContain('Test Prompt Spec');
    expect(promptSpec!.template_language).toBe('handlebars');
    expect(promptSpec!.version).toBe(1);

    // Get prompt spec
    const { data: retrieved, error: getError } = await client.GET('/api/prompt-specs/{id}', {
      params: { path: { id: promptSpec!.id } },
    });

    expect(getError).toBeUndefined();
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(promptSpec!.id);
    expect(retrieved!.name).toBe(promptSpec!.name);
    expect(retrieved!.template_language).toBe('handlebars');
    expect(retrieved!.template).toContain('Summarize');

    // Delete prompt spec
    const { data: deleteResult, error: deleteError } = await client.DELETE(
      '/api/prompt-specs/{id}',
      {
        params: { path: { id: promptSpec!.id } },
      },
    );
    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);
  });
});
