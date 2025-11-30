import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Action API', () => {
  it('should create and retrieve an action', async () => {
    // Create action
    const actionId = `test-action-${Date.now()}`;
    const { data: action, error: createError } = await client.POST('/api/actions', {
      body: {
        id: actionId,
        name: `Test Action ${Date.now()}`,
        description: 'E2E test action for LLM call',
        version: 1,
        kind: 'llm_call',
        implementation: {
          model: 'claude-3-5-sonnet-20241022',
          temperature: 0.7,
        },
        requires: {
          input: 'string',
        },
        produces: {
          output: 'string',
        },
      },
    });
    expect(createError).toBeUndefined();
    expect(action).toBeDefined();
    expect(action!.id).toBeDefined();
    expect(action!.name).toContain('Test Action');
    expect(action!.kind).toBe('llm_call');
    expect(action!.version).toBe(1);

    // Get action
    const { data: retrieved, error: getError } = await client.GET('/api/actions/{id}', {
      params: { path: { id: action!.id } },
    });

    expect(getError).toBeUndefined();
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(action!.id);
    expect(retrieved!.name).toBe(action!.name);
    expect(retrieved!.kind).toBe('llm_call');

    // Delete action
    const { data: deleteResult, error: deleteError } = await client.DELETE('/api/actions/{id}', {
      params: { path: { id: action!.id } },
    });
    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);
  });
});
