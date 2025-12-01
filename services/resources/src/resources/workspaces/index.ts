/** Workspaces RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
import * as repo from './repository';

export class Workspaces extends Resource {
  async create(data: { name: string; settings?: Record<string, unknown> }): Promise<{
    workspace_id: string;
    workspace: {
      id: string;
      name: string;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('workspace_create_started', { name: data.name });

    try {
      const workspace = await repo.createWorkspace(this.serviceCtx.db, {
        name: data.name,
        settings: data.settings ?? null,
      });

      this.serviceCtx.logger.info('workspace_created', {
        workspace_id: workspace.id,
        name: workspace.name,
      });

      return {
        workspace_id: workspace.id,
        workspace: {
          ...workspace,
          settings: workspace.settings as Record<string, unknown> | null,
        },
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn('workspace_create_conflict', {
          name: data.name,
          field: dbError.field,
        });
        throw new ConflictError(
          `Workspace with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error('workspace_create_failed', {
        name: data.name,
        error: dbError.message,
      });
      throw error;
    }
  }

  async get(id: string): Promise<{
    workspace: {
      id: string;
      name: string;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('workspace_get', { workspace_id: id });

    const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
    if (!workspace) {
      this.serviceCtx.logger.warn('workspace_not_found', { workspace_id: id });
      throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
    }

    return {
      workspace: {
        ...workspace,
        settings: workspace.settings as Record<string, unknown> | null,
      },
    };
  }

  async list(params?: { limit?: number }): Promise<{
    workspaces: Array<{
      id: string;
      name: string;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    this.serviceCtx.logger.info('workspace_list', params);

    const workspaces = await repo.listWorkspaces(this.serviceCtx.db, params?.limit);

    return {
      workspaces: workspaces.map((w) => ({
        ...w,
        settings: w.settings as Record<string, unknown> | null,
      })),
    };
  }

  async update(
    id: string,
    data: { name?: string; settings?: Record<string, unknown> },
  ): Promise<{
    workspace: {
      id: string;
      name: string;
      settings: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    this.serviceCtx.logger.info('workspace_update_started', { workspace_id: id });

    const workspace = await repo.updateWorkspace(this.serviceCtx.db, id, data);
    if (!workspace) {
      this.serviceCtx.logger.warn('workspace_not_found', { workspace_id: id });
      throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
    }

    this.serviceCtx.logger.info('workspace_updated', {
      workspace_id: workspace.id,
      name: workspace.name,
    });

    return {
      workspace: {
        ...workspace,
        settings: workspace.settings as Record<string, unknown> | null,
      },
    };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info('workspace_delete_started', { workspace_id: id });

    // Verify workspace exists
    const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
    if (!workspace) {
      this.serviceCtx.logger.warn('workspace_not_found', { workspace_id: id });
      throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
    }

    await repo.deleteWorkspace(this.serviceCtx.db, id);
    this.serviceCtx.logger.info('workspace_deleted', { workspace_id: id });

    return { success: true };
  }
}
