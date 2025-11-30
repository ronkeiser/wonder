import { describe, expect, it } from 'vitest';

const baseUrl = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

describe('Workspace API', () => {
  it('should create and delete a workspace', async () => {
    // Create workspace
    const createRes = await fetch(`${baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Test Workspace ${Date.now()}`,
      }),
    });
    expect(createRes.status).toBe(201);

    const workspace = (await createRes.json()) as any;
    expect(workspace.workspace_id).toBeDefined();
    expect(workspace.workspace).toBeDefined();
    expect(workspace.workspace.name).toContain('Test Workspace');

    // Delete workspace
    const deleteRes = await fetch(`${baseUrl}/api/workspaces/${workspace.workspace_id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    const result = (await deleteRes.json()) as any;
    expect(result.success).toBe(true);
  });
});
