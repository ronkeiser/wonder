import * as graphService from '~/domains/graph/service';
import { Resource } from './resource';

/**
 * Workspaces RPC resource
 * Exposes workspace CRUD operations
 */
export class Workspaces extends Resource {
  /**
   * Create a new workspace
   */
  async create(data: { name: string; settings?: unknown }) {
    const workspace = await graphService.createWorkspace(this.serviceCtx, data);
    return {
      workspace_id: workspace.id,
      workspace,
    };
  }

  /**
   * Get a workspace by ID
   */
  async get(workspaceId: string) {
    const workspace = await graphService.getWorkspace(this.serviceCtx, workspaceId);
    return { workspace };
  }

  /**
   * List workspaces with optional pagination
   */
  async list(options?: { limit?: number; offset?: number }) {
    const workspaces = await graphService.listWorkspaces(this.serviceCtx, options);
    return { workspaces };
  }

  /**
   * Update a workspace
   */
  async update(workspaceId: string, data: { name?: string; settings?: unknown }) {
    const workspace = await graphService.updateWorkspace(this.serviceCtx, workspaceId, data);
    return { workspace };
  }

  /**
   * Delete a workspace
   * Note: Cascading deletes handled by DB foreign key constraints
   */
  async delete(workspaceId: string) {
    await graphService.deleteWorkspace(this.serviceCtx, workspaceId);
    return { success: true };
  }
}
