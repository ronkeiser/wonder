import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Workspace API', () => {
  it('should create and delete a workspace', async () => {
    // Create workspace
    const { data: workspace, error: createError } = await client.POST('/api/workspaces', {
      body: {
        name: `Test Workspace ${Date.now()}`,
      },
    });

    expect(createError).toBeUndefined();
    expect(workspace).toBeDefined();
    expect(workspace?.id).toBeDefined();
    expect(workspace?.name).toContain('Test Workspace');

    // Delete workspace
    const { data: deleteResult, error: deleteError } = await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspace!.id } },
    });

    expect(deleteError).toBeUndefined();
    expect(deleteResult).toBeDefined();
    expect(deleteResult?.success).toBe(true);
  });
});
