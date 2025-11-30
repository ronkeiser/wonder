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
    this.serviceCtx.logger.info('workspace_create_started', { name: data.name });

    const workspace = await graphRepo.createWorkspace(this.serviceCtx.db, {
      name: data.name,
      settings: data.settings ?? null,
    });

    this.serviceCtx.logger.info('workspace_created', {
      workspace_id: workspace.id,
      name: workspace.name,
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
    this.serviceCtx.logger.info('workspace_get', { workspace_id: workspaceId });

    const workspace = await graphRepo.getWorkspace(this.serviceCtx.db, workspaceId);
    if (!workspace) {
      this.serviceCtx.logger.error('workspace_not_found', { workspace_id: workspaceId });
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return { workspace };
  }

  /**
   * List workspaces with optional pagination
   */
  async list(options?: { limit?: number; offset?: number }) {
    this.serviceCtx.logger.info('workspace_list', options);

    const workspaces = await graphRepo.listWorkspaces(this.serviceCtx.db, options);

    return { workspaces };
  }

  /**
   * Update a workspace
   */
  async update(workspaceId: string, data: { name?: string; settings?: unknown }) {
    this.serviceCtx.logger.info('workspace_update_started', { workspace_id: workspaceId });

    const workspace = await graphRepo.updateWorkspace(this.serviceCtx.db, workspaceId, {
      name: data.name,
      settings: data.settings ?? undefined,
    });

    this.serviceCtx.logger.info('workspace_updated', {
      workspace_id: workspace.id,
      name: workspace.name,
    });

    return { workspace };
  }

  /**
   * Delete a workspace
   * Note: Cascading deletes handled by DB foreign key constraints
   */
  async delete(workspaceId: string) {
    this.serviceCtx.logger.info('workspace_delete_started', { workspace_id: workspaceId });

    // Verify workspace exists
    const workspace = await graphRepo.getWorkspace(this.serviceCtx.db, workspaceId);
    if (!workspace) {
      this.serviceCtx.logger.error('workspace_not_found', { workspace_id: workspaceId });
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Delete workspace (cascades to projects, etc.)
    await this.serviceCtx.db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    this.serviceCtx.logger.info('workspace_deleted', { workspace_id: workspaceId });

    return { success: true };
  }
}
