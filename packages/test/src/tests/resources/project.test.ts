import { describe, expect, it } from 'vitest';
import { client } from '~/client';

describe('Project API', () => {
  it('should create and delete a project', async () => {
    // Create workspace first
    const { data: workspaceResponse, error: workspaceError } = await client.POST(
      '/api/workspaces',
      {
        body: {
          name: `Test Workspace ${Date.now()}`,
        },
      },
    );

    expect(workspaceError).toBeUndefined();
    expect(workspaceResponse).toBeDefined();
    expect(workspaceResponse!.workspace.id).toBeDefined();

    // Create project
    const { data: projectResponse, error: createError } = await client.POST('/api/projects', {
      body: {
        workspace_id: workspaceResponse!.workspace.id,
        name: `Test Project ${Date.now()}`,
        description: 'E2E test project',
      },
    });

    expect(createError).toBeUndefined();
    expect(projectResponse).toBeDefined();
    expect(projectResponse!.project_id).toBeDefined();
    expect(projectResponse!.project).toBeDefined();
    expect(projectResponse!.project.id).toBeDefined();
    expect(projectResponse!.project.name).toContain('Test Project');
    expect(projectResponse!.project.workspace_id).toBe(workspaceResponse!.workspace.id);

    // Delete project
    const { data: deleteResult, error: deleteError } = await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });

    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);

    // Clean up workspace
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
