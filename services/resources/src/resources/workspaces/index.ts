/** Workspaces RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Workspace, WorkspaceInput, WorkspaceSettingsInput } from './types';

export class Workspaces extends Resource {
  async create(data: WorkspaceInput): Promise<{
    workspaceId: string;
    workspace: Workspace;
  }> {
    return this.withLogging('create', { metadata: { name: data.name } }, async () => {
      try {
        const workspace = await repo.createWorkspace(this.serviceCtx.db, data);

        return {
          workspaceId: workspace.id,
          workspace,
        };
      } catch (error) {
        const dbError = extractDbError(error);

        if (dbError.constraint === 'unique') {
          throw new ConflictError(
            `Workspace with ${dbError.field} already exists`,
            dbError.field,
            'unique',
          );
        }

        throw error;
      }
    });
  }

  async get(id: string): Promise<{ workspace: Workspace }> {
    return this.withLogging(
      'get',
      { workspaceId: id, metadata: { workspaceId: id } },
      async () => {
        const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
        if (!workspace) {
          throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
        }
        return { workspace };
      },
    );
  }

  async list(params?: { limit?: number }): Promise<{ workspaces: Workspace[] }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const workspaces = await repo.listWorkspaces(this.serviceCtx.db, params?.limit);
      return { workspaces };
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      settings?: WorkspaceSettingsInput;
    },
  ): Promise<{ workspace: Workspace }> {
    return this.withLogging(
      'update',
      { workspaceId: id, metadata: { workspaceId: id } },
      async () => {
        const workspace = await repo.updateWorkspace(this.serviceCtx.db, id, {
          name: data.name,
          settings: data.settings,
        });
        if (!workspace) {
          throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
        }
        return { workspace };
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { workspaceId: id, metadata: { workspaceId: id } },
      async () => {
        const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
        if (!workspace) {
          throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
        }

        await repo.deleteWorkspace(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
