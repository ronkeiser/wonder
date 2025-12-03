import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Workspace API', () => {
  it('should create and delete a workspace', async () => {
    // Create workspace
    const { data: createResponse, error: createError } = await client.workspaces.create({
      name: `Test Workspace ${Date.now()}`,
    });

    expect(createError).toBeUndefined();
    expect(createResponse).toBeDefined();
    expect(createResponse?.workspace_id).toBeDefined();
    expect(createResponse?.workspace).toBeDefined();
    expect(createResponse?.workspace.id).toBeDefined();
    expect(createResponse?.workspace.name).toContain('Test Workspace');

    const workspaceId = createResponse!.workspace.id;

    // Get workspace
    const { data: getResponse, error: getError } = await client.workspaces(workspaceId).get();

    expect(getError).toBeUndefined();
    expect(getResponse).toBeDefined();
    expect(getResponse?.workspace.id).toBe(workspaceId);

    // Delete workspace
    const { data: deleteResult, error: deleteError } = await client
      .workspaces(workspaceId)
      .delete();

    expect(deleteError).toBeUndefined();
    expect(deleteResult).toBeDefined();
    expect(deleteResult?.success).toBe(true);
  });

  it('should list workspaces', async () => {
    // Create a test workspace
    const { data: createResponse, error: createError } = await client.workspaces.create({
      name: `List Test Workspace ${Date.now()}`,
    });

    expect(createError).toBeUndefined();
    expect(createResponse).toBeDefined();
    const workspaceId = createResponse!.workspace.id;

    // List workspaces
    const { data: listResponse, error: listError } = await client.workspaces.list({ limit: 100 });

    expect(listError).toBeUndefined();
    expect(listResponse).toBeDefined();
    expect(listResponse?.workspaces).toBeDefined();
    expect(Array.isArray(listResponse?.workspaces)).toBe(true);

    // Cleanup
    await client.workspaces(workspaceId).delete();
  });

  it('should update a workspace', async () => {
    // Create workspace
    const { data: createResponse, error: createError } = await client.workspaces.create({
      name: `Update Test Workspace ${Date.now()}`,
      settings: { theme: 'dark' },
    });

    expect(createError).toBeUndefined();
    expect(createResponse).toBeDefined();
    const workspaceId = createResponse!.workspace.id;

    // Update workspace
    const { data: updateResponse, error: updateError } = await client
      .workspaces(workspaceId)
      .update({
        name: 'Updated Workspace Name',
        settings: { theme: 'light', newSetting: true },
      });

    expect(updateError).toBeUndefined();
    expect(updateResponse).toBeDefined();
    expect(updateResponse?.workspace.id).toBe(workspaceId);
    expect(updateResponse?.workspace.name).toBe('Updated Workspace Name');
    expect(updateResponse?.workspace.settings).toEqual({ theme: 'light', newSetting: true });

    // Verify update by getting workspace
    const { data: getResponse, error: getError } = await client.workspaces(workspaceId).get();

    expect(getError).toBeUndefined();
    expect(getResponse?.workspace.name).toBe('Updated Workspace Name');
    expect(getResponse?.workspace.settings).toEqual({ theme: 'light', newSetting: true });

    // Cleanup
    await client.workspaces(workspaceId).delete();
  });

  it('should partially update a workspace', async () => {
    // Create workspace
    const { data: createResponse, error: createError } = await client.workspaces.create({
      name: `Partial Update Test ${Date.now()}`,
      settings: { theme: 'dark', mode: 'production' },
    });

    expect(createError).toBeUndefined();
    expect(createResponse).toBeDefined();
    const workspaceId = createResponse!.workspace.id;

    // Update only the name
    const { data: updateResponse, error: updateError } = await client
      .workspaces(workspaceId)
      .update({
        name: 'New Name Only',
      });

    expect(updateError).toBeUndefined();
    expect(updateResponse).toBeDefined();
    expect(updateResponse?.workspace.name).toBe('New Name Only');
    expect(updateResponse?.workspace.settings).toEqual({ theme: 'dark', mode: 'production' });

    // Cleanup
    await client.workspaces(workspaceId).delete();
  });
});
