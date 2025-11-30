import { eq } from 'drizzle-orm';
import * as graphRepo from '~/domains/graph/repository';
import { workspaces } from '~/infrastructure/db/schema';
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
    const workspace = await graphRepo.createWorkspace(this.serviceCtx.db, {
      name: data.name,
      settings: data.settings ?? null,
    });

    return {
      workspace_id: workspace.id,
      workspace,
    };
  }

  /**
   * Get a workspace by ID
   */
  async get(workspaceId: string) {
    const workspace = await graphRepo.getWorkspace(this.serviceCtx.db, workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return { workspace };
  }

  /**
   * Delete a workspace
   * Note: Cascading deletes handled by DB foreign key constraints
   */
  async delete(workspaceId: string) {
    // Verify workspace exists
    const workspace = await graphRepo.getWorkspace(this.serviceCtx.db, workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Delete workspace (cascades to projects, etc.)
    await this.serviceCtx.db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    return { success: true };
  }
}
