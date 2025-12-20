/** Workspaces RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';

export class Workspaces extends Resource {
  async create(data: {
    name: string;
    settings?: {
      allowedModelProviders?: string[];
      allowedMcpServers?: string[];
      budgetMaxMonthlySpendCents?: number;
      budgetAlertThresholdCents?: number;
    };
  }): Promise<{
    workspaceId: string;
    workspace: {
      id: string;
      name: string;
      settings: {
        allowedModelProviders?: string[];
        allowedMcpServers?: string[];
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
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
                allowedModelProviders: data.settings.allowedModelProviders,
                allowedMcpServers: data.settings.allowedMcpServers,
                budgetMaxMonthlySpendCents: data.settings.budgetMaxMonthlySpendCents,
                budgetAlertThresholdCents: data.settings.budgetAlertThresholdCents,
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
                  allowedModelProviders: workspace.settings.allowedModelProviders,
                  allowedMcpServers: workspace.settings.allowedMcpServers,
                  budgetMaxMonthlySpendCents: workspace.settings.budgetMaxMonthlySpendCents,
                  budgetAlertThresholdCents: workspace.settings.budgetAlertThresholdCents,
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
        allowedModelProviders?: string[];
        allowedMcpServers?: string[];
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
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
                  allowedModelProviders: workspace.settings.allowedModelProviders,
                  allowedMcpServers: workspace.settings.allowedMcpServers,
                  budgetMaxMonthlySpendCents: workspace.settings.budgetMaxMonthlySpendCents,
                  budgetAlertThresholdCents: workspace.settings.budgetAlertThresholdCents,
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
        allowedModelProviders?: string[];
        allowedMcpServers?: string[];
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
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
                allowedModelProviders: workspace.settings.allowedModelProviders,
                allowedMcpServers: workspace.settings.allowedMcpServers,
                budgetMaxMonthlySpendCents: workspace.settings.budgetMaxMonthlySpendCents,
                budgetAlertThresholdCents: workspace.settings.budgetAlertThresholdCents,
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
        allowedModelProviders?: string[];
        allowedMcpServers?: string[];
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
      };
    },
  ): Promise<{
    workspace: {
      id: string;
      name: string;
      settings: {
        allowedModelProviders?: string[];
        allowedMcpServers?: string[];
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
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
                allowedModelProviders: data.settings.allowedModelProviders,
                allowedMcpServers: data.settings.allowedMcpServers,
                budgetMaxMonthlySpendCents: data.settings.budgetMaxMonthlySpendCents,
                budgetAlertThresholdCents: data.settings.budgetAlertThresholdCents,
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
                  allowedModelProviders: workspace.settings.allowedModelProviders,
                  allowedMcpServers: workspace.settings.allowedMcpServers,
                  budgetMaxMonthlySpendCents: workspace.settings.budgetMaxMonthlySpendCents,
                  budgetAlertThresholdCents: workspace.settings.budgetAlertThresholdCents,
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
