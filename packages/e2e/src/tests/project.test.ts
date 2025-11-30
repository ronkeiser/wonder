import { describe, expect, it } from 'vitest';
import { log, logRequest, logResponse } from '../utils/logger.js';

const baseUrl = process.env.API_URL || 'https://wonder-http.ron-keiser.workers.dev';

describe('Project API', () => {
  it('should create and delete a project', async () => {
    log('Creating workspace');
    // Create workspace first
    const workspaceBody = { name: `Test Workspace ${Date.now()}` };
    logRequest('POST', `${baseUrl}/api/workspaces`, workspaceBody);

    const workspaceRes = await fetch(`${baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workspaceBody),
    });

    const workspace = (await workspaceRes.json()) as any;
    logResponse(workspaceRes.status, workspace);
    expect(workspaceRes.status).toBe(201);

    const workspaceId = workspace.workspace_id;
    log(`Workspace created: ${workspaceId}`);

    // Create project
    log('Creating project');
    const projectBody = {
      workspace_id: workspaceId,
      name: `Test Project ${Date.now()}`,
      description: 'E2E test project',
    };
    logRequest('POST', `${baseUrl}/api/projects`, projectBody);

    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectBody),
    });

    const project = (await createRes.json()) as any;
    logResponse(createRes.status, project);
    expect(createRes.status).toBe(201);
    expect(project.project_id).toBeDefined();
    expect(project.project).toBeDefined();
    expect(project.project.name).toContain('Test Project');
    expect(project.project.workspace_id).toBe(workspaceId);
    log(`Project created: ${project.project_id}`);

    // Delete project
    log('Deleting project');
    logRequest('DELETE', `${baseUrl}/api/projects/${project.project_id}`);

    const deleteProjectRes = await fetch(`${baseUrl}/api/projects/${project.project_id}`, {
      method: 'DELETE',
    });

    const projectResult = (await deleteProjectRes.json()) as any;
    logResponse(deleteProjectRes.status, projectResult);
    expect(deleteProjectRes.status).toBe(200);
    expect(projectResult.success).toBe(true);
    log('Project deleted');

    // Clean up workspace
    // Clean up workspace
    log('Cleaning up workspace');
    logRequest('DELETE', `${baseUrl}/api/workspaces/${workspaceId}`);
    await fetch(`${baseUrl}/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
    });
    log('Workspace deleted');
  });
});
