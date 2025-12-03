/** Workspaces RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
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
    this.serviceCtx.logger.info({
      event_type: 'workspace_create_started',
      metadata: { name: data.name },
    });

    try {
      const workspace = await repo.createWorkspace(this.serviceCtx.db, {
        name: data.name,
        settings: data.settings ?? null,
      });

      this.serviceCtx.logger.info({
        event_type: 'workspace_created',
        workspace_id: workspace.id,
        metadata: { name: workspace.name },
      });

      return {
        workspace_id: workspace.id,
        workspace,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          event_type: 'workspace_create_conflict',
          metadata: { name: data.name, field: dbError.field },
        });
        throw new ConflictError(
          `Workspace with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      this.serviceCtx.logger.error({
        event_type: 'workspace_create_failed',
        message: dbError.message,
        metadata: { name: data.name },
      });
      throw error;
    }
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
    this.serviceCtx.logger.info({ event_type: 'workspace_get', workspace_id: id });

    const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
    if (!workspace) {
      this.serviceCtx.logger.warn({ event_type: 'workspace_not_found', workspace_id: id });
      throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
    }

    return { workspace };
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
    this.serviceCtx.logger.info({ event_type: 'workspace_list', metadata: params });

    const workspaces = await repo.listWorkspaces(this.serviceCtx.db, params?.limit);

    return { workspaces };
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
    this.serviceCtx.logger.info({ event_type: 'workspace_update_started', workspace_id: id });

    const workspace = await repo.updateWorkspace(this.serviceCtx.db, id, data);
    if (!workspace) {
      this.serviceCtx.logger.warn({ event_type: 'workspace_not_found', workspace_id: id });
      throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
    }

    this.serviceCtx.logger.info({
      event_type: 'workspace_updated',
      workspace_id: workspace.id,
      metadata: { name: workspace.name },
    });

    return { workspace };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info({ event_type: 'workspace_delete_started', workspace_id: id });

    // Verify workspace exists
    const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
    if (!workspace) {
      this.serviceCtx.logger.warn({ event_type: 'workspace_not_found', workspace_id: id });
      throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
    }

    await repo.deleteWorkspace(this.serviceCtx.db, id);
    this.serviceCtx.logger.info({ event_type: 'workspace_deleted', workspace_id: id });

    return { success: true };
  }
}
