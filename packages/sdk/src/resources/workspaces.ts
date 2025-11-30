import type { CreateWorkspaceRequest, Workspace } from '../types/workspaces';

export class WorkspacesResource {
  constructor(private baseUrl: string) {}

  async create(
    request: CreateWorkspaceRequest,
  ): Promise<{ workspace_id: string; workspace: Workspace }> {
    const response = await fetch(`${this.baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create workspace: ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { workspace_id: string; workspace: Workspace };
  }

  async get(workspaceId: string): Promise<{ workspace: Workspace }> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}`);

    if (!response.ok) {
      throw new Error(`Failed to get workspace: ${response.statusText}`);
    }

    return (await response.json()) as { workspace: Workspace };
  }

  async delete(workspaceId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete workspace: ${response.statusText}`);
    }

    return (await response.json()) as { success: boolean };
  }
}
