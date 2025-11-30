import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Project API', () => {
  it('should create and delete a project', async () => {
    // Create workspace first
    const { data: workspace, error: workspaceError } = await client.workspaces.create({
      name: `Test Workspace ${Date.now()}`,
    });

    expect(workspaceError).toBeUndefined();
    expect(workspace).toBeDefined();
    expect(workspace!.id).toBeDefined();

    // Create project
    const { data: project, error: createError } = await client.projects.create({
      workspace_id: workspace!.id,
      name: `Test Project ${Date.now()}`,
      description: 'E2E test project',
    });

    expect(createError).toBeUndefined();
    expect(project).toBeDefined();
    expect(project!.id).toBeDefined();
    expect(project!.name).toContain('Test Project');
    expect(project!.workspace_id).toBe(workspace!.id);

    // Delete project
    const { data: deleteResult, error: deleteError } = await client.projects.delete(project!.id);

    expect(deleteError).toBeUndefined();
    expect(deleteResult?.success).toBe(true);

    // Clean up workspace
    await client.workspaces.delete(workspace!.id);
  });
});
