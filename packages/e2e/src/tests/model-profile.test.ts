import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('ModelProfile API', () => {
  it('should create and retrieve a model profile', async () => {
    // Create model profile
    const { data: profile, error: createError } = await client.POST('/api/model-profiles', {
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
    expect(profile).toBeDefined();
    expect(profile!.id).toBeDefined();
    expect(profile!.name).toContain('Test Model');
    expect(profile!.provider).toBe('anthropic');
    expect(profile!.model_id).toBe('claude-3-5-sonnet-20241022');

    // Get model profile
    const { data: retrieved, error: getError } = await client.GET('/api/model-profiles/{id}', {
      params: { path: { id: profile!.id } },
    });
    expect(getError).toBeUndefined();
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(profile!.id);
    expect(retrieved!.provider).toBe('anthropic');

    // Delete model profile
    const { data: deleteResult, error: deleteError } = await client.DELETE(
      '/api/model-profiles/{id}',
      {
        params: { path: { id: profile!.id } },
      },
    );
    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);
  });
});
