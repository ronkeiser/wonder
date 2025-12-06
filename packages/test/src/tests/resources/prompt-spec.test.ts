import { describe, expect, it } from 'vitest';
import { client } from '~/client';

describe('PromptSpec API', () => {
  it('should create and retrieve a prompt spec', async () => {
    // Create prompt spec
    const { data: createResponse, error: createError } = await client.POST('/api/prompt-specs', {
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
    expect(createResponse).toBeDefined();
    expect(createResponse!.prompt_spec_id).toBeDefined();
    expect(createResponse!.prompt_spec).toBeDefined();
    expect(createResponse!.prompt_spec.id).toBeDefined();
    expect(createResponse!.prompt_spec.name).toContain('Test Prompt Spec');
    expect(createResponse!.prompt_spec.template_language).toBe('handlebars');
    expect(createResponse!.prompt_spec.version).toBe(1);

    // Get prompt spec
    const { data: getResponse, error: getError } = await client.GET('/api/prompt-specs/{id}', {
      params: { path: { id: createResponse!.prompt_spec.id } },
    });

    expect(getError).toBeUndefined();
    expect(getResponse).toBeDefined();
    expect(getResponse!.prompt_spec).toBeDefined();
    expect(getResponse!.prompt_spec.id).toBe(createResponse!.prompt_spec.id);
    expect(getResponse!.prompt_spec.name).toBe(createResponse!.prompt_spec.name);
    expect(getResponse!.prompt_spec.template_language).toBe('handlebars');
    expect(getResponse!.prompt_spec.template).toContain('Summarize');

    // Delete prompt spec
    const { data: deleteResult, error: deleteError } = await client.DELETE(
      '/api/prompt-specs/{id}',
      {
        params: { path: { id: createResponse!.prompt_spec.id } },
      },
    );
    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);
  });
});
