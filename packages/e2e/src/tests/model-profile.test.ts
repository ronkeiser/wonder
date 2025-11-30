import { describe, expect, it } from 'vitest';

const baseUrl = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

describe('ModelProfile API', () => {
  it('should create and retrieve a model profile', async () => {
    // Create model profile
    const profileBody = {
      name: `Test Model ${Date.now()}`,
      provider: 'anthropic',
      model_id: 'claude-3-5-sonnet-20241022',
      parameters: {
        temperature: 0.7,
        max_tokens: 1000,
      },
      cost_per_1k_input_tokens: 0.003,
      cost_per_1k_output_tokens: 0.015,
    };

    const createRes = await fetch(`${baseUrl}/api/model-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileBody),
    });

    expect(createRes.status).toBe(201);
    const result = (await createRes.json()) as any;
    expect(result.model_profile_id).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(result.profile.name).toContain('Test Model');
    expect(result.profile.provider).toBe('anthropic');
    expect(result.profile.model_id).toBe('claude-3-5-sonnet-20241022');

    // Get model profile
    const getRes = await fetch(`${baseUrl}/api/model-profiles/${result.model_profile_id}`);
    expect(getRes.status).toBe(200);
    const retrieved = (await getRes.json()) as any;
    expect(retrieved.profile).toBeDefined();
    expect(retrieved.profile.id).toBe(result.model_profile_id);
    expect(retrieved.profile.provider).toBe('anthropic');

    // Delete model profile
    const deleteRes = await fetch(`${baseUrl}/api/model-profiles/${result.model_profile_id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const deleteResult = (await deleteRes.json()) as any;
    expect(deleteResult.success).toBe(true);
  });
});
