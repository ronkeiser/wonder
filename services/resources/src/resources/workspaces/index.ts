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
    workspaceId: string;
    workspace: {
      id: string;
      name: string;
      settings: {
        allowed_model_providers?: string[];
        allowed_mcp_servers?: string[];
        budget_max_monthly_spend_cents?: number;
        budget_alert_threshold_cents?: number;
      } | null;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.withLogging('create', { metadata: { name: data.name } }, async () => {
      try {
        const workspace = await repo.createWorkspace(this.serviceCtx.db, {
          name: data.name,
          settings: data.settings
            ? {
                allowedModelProviders: data.settings.allowed_model_providers,
                allowedMcpServers: data.settings.allowed_mcp_servers,
                budgetMaxMonthlySpendCents: data.settings.budget_max_monthly_spend_cents,
                budgetAlertThresholdCents: data.settings.budget_alert_threshold_cents,
              }
            : null,
        });

        return {
          workspaceId: workspace.id,
          workspace: {
            ...workspace,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
            settings: workspace.settings
              ? {
                  allowed_model_providers: workspace.settings.allowedModelProviders,
                  allowed_mcp_servers: workspace.settings.allowedMcpServers,
                  budget_max_monthly_spend_cents: workspace.settings.budgetMaxMonthlySpendCents,
                  budget_alert_threshold_cents: workspace.settings.budgetAlertThresholdCents,
                }
              : null,
          },
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
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.withLogging(
      'get',
      { workspaceId: id, metadata: { workspaceId: id } },
      async () => {
        const workspace = await repo.getWorkspace(this.serviceCtx.db, id);
        if (!workspace) {
          throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
        }
        return {
          workspace: {
            ...workspace,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
            settings: workspace.settings
              ? {
                  allowed_model_providers: workspace.settings.allowedModelProviders,
                  allowed_mcp_servers: workspace.settings.allowedMcpServers,
                  budget_max_monthly_spend_cents: workspace.settings.budgetMaxMonthlySpendCents,
                  budget_alert_threshold_cents: workspace.settings.budgetAlertThresholdCents,
                }
              : null,
          },
        };
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
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const workspaces = await repo.listWorkspaces(this.serviceCtx.db, params?.limit);
      return {
        workspaces: workspaces.map((workspace) => ({
          ...workspace,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          settings: workspace.settings
            ? {
                allowed_model_providers: workspace.settings.allowedModelProviders,
                allowed_mcp_servers: workspace.settings.allowedMcpServers,
                budget_max_monthly_spend_cents: workspace.settings.budgetMaxMonthlySpendCents,
                budget_alert_threshold_cents: workspace.settings.budgetAlertThresholdCents,
              }
            : null,
        })),
      };
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
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.withLogging(
      'update',
      { workspaceId: id, metadata: { workspaceId: id } },
      async () => {
        const workspace = await repo.updateWorkspace(this.serviceCtx.db, id, {
          name: data.name,
          settings: data.settings
            ? {
                allowedModelProviders: data.settings.allowed_model_providers,
                allowedMcpServers: data.settings.allowed_mcp_servers,
                budgetMaxMonthlySpendCents: data.settings.budget_max_monthly_spend_cents,
                budgetAlertThresholdCents: data.settings.budget_alert_threshold_cents,
              }
            : undefined,
        });
        if (!workspace) {
          throw new NotFoundError(`Workspace not found: ${id}`, 'workspace', id);
        }
        return {
          workspace: {
            ...workspace,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
            settings: workspace.settings
              ? {
                  allowed_model_providers: workspace.settings.allowedModelProviders,
                  allowed_mcp_servers: workspace.settings.allowedMcpServers,
                  budget_max_monthly_spend_cents: workspace.settings.budgetMaxMonthlySpendCents,
                  budget_alert_threshold_cents: workspace.settings.budgetAlertThresholdCents,
                }
              : null,
          },
        };
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
