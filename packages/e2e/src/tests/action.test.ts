import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Action API', () => {
  it('should create and retrieve an action', async () => {
    // Create action
    const actionId = `test-action-${Date.now()}`;
    const { data: createResponse, error: createError } = await client.POST('/api/actions', {
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
    expect(createResponse).toBeDefined();
    expect(createResponse!.action_id).toBeDefined();
    expect(createResponse!.action).toBeDefined();
    expect(createResponse!.action.id).toBeDefined();
    expect(createResponse!.action.name).toContain('Test Action');
    expect(createResponse!.action.kind).toBe('llm_call');
    expect(createResponse!.action.version).toBe(1);

    // Get action
    const { data: getResponse, error: getError } = await client.GET('/api/actions/{id}', {
      params: { path: { id: createResponse!.action.id } },
    });

    expect(getError).toBeUndefined();
    expect(getResponse).toBeDefined();
    expect(getResponse!.action).toBeDefined();
    expect(getResponse!.action.id).toBe(createResponse!.action.id);
    expect(getResponse!.action.name).toBe(createResponse!.action.name);
    expect(getResponse!.action.kind).toBe('llm_call');

    // Delete action
    const { data: deleteResult, error: deleteError } = await client.DELETE('/api/actions/{id}', {
      params: { path: { id: createResponse!.action.id } },
    });
    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);
  });
});
