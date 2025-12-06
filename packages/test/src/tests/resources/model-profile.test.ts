import { describe, expect, it } from 'vitest';
import { client } from '~/client';

describe('ModelProfile API', () => {
  it('should create and retrieve a model profile', async () => {
    // Create model profile
    const { data: createResponse, error: createError } = await client.POST('/api/model-profiles', {
      body: {
        name: `Test Model ${Date.now()}`,
        provider: 'anthropic',
        model_id: 'claude-3-5-sonnet-20241022',
        parameters: {
          temperature: 0.7,
          max_tokens: 1000,
        },
        cost_per_1k_input_tokens: 0.003,
        cost_per_1k_output_tokens: 0.015,
      },
    });

    expect(createError).toBeUndefined();
    expect(createResponse).toBeDefined();
    expect(createResponse!.model_profile_id).toBeDefined();
    expect(createResponse!.model_profile).toBeDefined();
    expect(createResponse!.model_profile.id).toBeDefined();
    expect(createResponse!.model_profile.name).toContain('Test Model');
    expect(createResponse!.model_profile.provider).toBe('anthropic');
    expect(createResponse!.model_profile.model_id).toBe('claude-3-5-sonnet-20241022');

    // Get model profile
    const { data: getResponse, error: getError } = await client.GET('/api/model-profiles/{id}', {
      params: { path: { id: createResponse!.model_profile.id } },
    });
    expect(getError).toBeUndefined();
    expect(getResponse).toBeDefined();
    expect(getResponse!.model_profile).toBeDefined();
    expect(getResponse!.model_profile.id).toBe(createResponse!.model_profile.id);
    expect(getResponse!.model_profile.provider).toBe('anthropic');

    // Delete model profile
    const { data: deleteResult, error: deleteError } = await client.DELETE(
      '/api/model-profiles/{id}',
      {
        params: { path: { id: createResponse!.model_profile.id } },
      },
    );
    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);
  });
});
