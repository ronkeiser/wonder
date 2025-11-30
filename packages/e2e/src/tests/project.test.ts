import { describe, expect, it } from 'vitest';

const baseUrl = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

describe('Project API', () => {
  it('should create and delete a project', async () => {
    // Create workspace first
    const workspaceBody = { name: `Test Workspace ${Date.now()}` };

    const workspaceRes = await fetch(`${baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workspaceBody),
    });

    const workspace = (await workspaceRes.json()) as any;
    expect(workspaceRes.status).toBe(201);

    const workspaceId = workspace.workspace_id;

    // Create project
    const projectBody = {
      workspace_id: workspaceId,
      name: `Test Project ${Date.now()}`,
      description: 'E2E test project',
    };

    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectBody),
    });

    const project = (await createRes.json()) as any;
    expect(createRes.status).toBe(201);
    expect(project.project_id).toBeDefined();
    expect(project.project).toBeDefined();
    expect(project.project.name).toContain('Test Project');
    expect(project.project.workspace_id).toBe(workspaceId);

    // Delete project

    const deleteProjectRes = await fetch(`${baseUrl}/api/projects/${project.project_id}`, {
      method: 'DELETE',
    });

    const projectResult = (await deleteProjectRes.json()) as any;
    expect(deleteProjectRes.status).toBe(200);
    expect(projectResult.success).toBe(true);

    // Clean up workspace
    await fetch(`${baseUrl}/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
    });
  });
});
