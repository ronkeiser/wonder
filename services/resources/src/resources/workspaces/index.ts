/** Workspaces RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';

export class Workspaces extends Resource {
  async create(data: {
    name: string;
    settings?: {
      allowed_model_providers?: string[];
      allowed_mcp_servers?: string[];
      budget_max_monthly_spend_cents?: number;
      budget_alert_threshold_cents?: number;
    };
  }): Promise<{
    workspace_id: string;
    workspace: {
      id: string;
      name: string;
      settings: {
        allowed_model_providers?: string[];
        allowed_mcp_servers?: string[];
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
      } | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging('create', { metadata: { name: data.name } }, async () => {
      try {
        const workspace = await repo.createWorkspace(this.serviceCtx.db, {
          name: data.name,
          settings: data.settings ?? null,
        });

        return {
          workspace_id: workspace.id,
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

  async get(id: string): Promise<{
    workspace: {
      id: string;
      name: string;
      settings: {
        allowed_model_providers?: string[];
        allowed_mcp_servers?: string[];
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
      } | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging(
      'get',
      { workspace_id: id, metadata: { workspace_id: id } },
      async () => {
        const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
        if (!workspace) {
          throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
        }
        return { workspace };
      },
    );
  }

  async list(params?: { limit?: number }): Promise<{
    workspaces: Array<{
      id: string;
      name: string;
      settings: {
        allowed_model_providers?: string[];
        allowed_mcp_servers?: string[];
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
      } | null;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const workspaces = await repo.listWorkspaces(this.serviceCtx.db, params?.limit);
      return { workspaces };
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      settings?: {
        allowed_model_providers?: string[];
        allowed_mcp_servers?: string[];
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
      };
    },
  ): Promise<{
    workspace: {
      id: string;
      name: string;
      settings: {
        allowed_model_providers?: string[];
        allowed_mcp_servers?: string[];
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
      } | null;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging(
      'update',
      { workspace_id: id, metadata: { workspace_id: id } },
      async () => {
        const workspace = await repo.updateWorkspace(this.serviceCtx.db, id, data);
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
      { workspace_id: id, metadata: { workspace_id: id } },
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
