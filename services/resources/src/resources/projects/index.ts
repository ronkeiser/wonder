/** Projects RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';

export class Projects extends Resource {
  async create(data: {
    workspaceId: string;
    name: string;
    description?: string;
    settings?: {
      defaultModelProfileId?: string;
      rateLimitMaxConcurrentRuns?: number;
      rateLimitMaxLlmCallsPerHour?: number;
      budgetMaxMonthlySpendCents?: number;
      budgetAlertThresholdCents?: number;
      snapshotPolicyEveryNEvents?: number;
      snapshotPolicyEveryNSeconds?: number;
      snapshotPolicyOnFanInComplete?: boolean;
    };
  }): Promise<{
    projectId: string;
    project: {
      id: string;
      workspaceId: string;
      name: string;
      description: string | null;
      settings: {
        defaultModelProfileId?: string;
        rateLimitMaxConcurrentRuns?: number;
        rateLimitMaxLlmCallsPerHour?: number;
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
        snapshotPolicyEveryNEvents?: number;
        snapshotPolicyEveryNSeconds?: number;
        snapshotPolicyOnFanInComplete?: boolean;
      } | null;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.withLogging(
      'create',
      {
        workspaceId: data.workspaceId,
        metadata: { workspaceId: data.workspaceId, name: data.name },
      },
      async () => {
        try {
          const project = await repo.createProject(this.serviceCtx.db, {
            workspaceId: data.workspaceId,
            name: data.name,
            description: data.description ?? null,
            settings: data.settings ?? null,
          });

          return {
            projectId: project.id,
            project,
          };
        } catch (error) {
          const dbError = extractDbError(error);

          if (dbError.constraint === 'unique') {
            throw new ConflictError(
              `Project with ${dbError.field} already exists`,
              dbError.field,
              'unique',
            );
          }

          if (dbError.constraint === 'foreign_key') {
            throw new NotFoundError(
              `Workspace not found: ${data.workspaceId}`,
              'workspace',
              data.workspaceId,
            );
          }

          throw error;
        }
      },
    );
  }

  async get(id: string): Promise<{
    project: {
      id: string;
      workspaceId: string;
      name: string;
      description: string | null;
      settings: {
        defaultModelProfileId?: string;
        rateLimitMaxConcurrentRuns?: number;
        rateLimitMaxLlmCallsPerHour?: number;
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
        snapshotPolicyEveryNEvents?: number;
        snapshotPolicyEveryNSeconds?: number;
        snapshotPolicyOnFanInComplete?: boolean;
      } | null;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.withLogging('get', { projectId: id, metadata: { projectId: id } }, async () => {
      const project = await repo.getProject(this.serviceCtx.db, id);
      if (!project) {
        throw new NotFoundError(`Project not found: ${id}`, 'project', id);
      }
      return { project };
    });
  }

  async list(params?: { workspaceId?: string; limit?: number }): Promise<{
    projects: Array<{
      id: string;
      workspaceId: string;
      name: string;
      description: string | null;
      settings: {
        defaultModelProfileId?: string;
        rateLimitMaxConcurrentRuns?: number;
        rateLimitMaxLlmCallsPerHour?: number;
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
        snapshotPolicyEveryNEvents?: number;
        snapshotPolicyEveryNSeconds?: number;
        snapshotPolicyOnFanInComplete?: boolean;
      } | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    return this.withLogging('list', { metadata: params }, async () => {
      const projects = await repo.listProjects(
        this.serviceCtx.db,
        params?.workspaceId,
        params?.limit,
      );
      return { projects };
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      settings?: {
        defaultModelProfileId?: string;
        rateLimitMaxConcurrentRuns?: number;
        rateLimitMaxLlmCallsPerHour?: number;
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
        snapshotPolicyEveryNEvents?: number;
        snapshotPolicyEveryNSeconds?: number;
        snapshotPolicyOnFanInComplete?: boolean;
      };
    },
  ): Promise<{
    project: {
      id: string;
      workspaceId: string;
      name: string;
      description: string | null;
      settings: {
        defaultModelProfileId?: string;
        rateLimitMaxConcurrentRuns?: number;
        rateLimitMaxLlmCallsPerHour?: number;
        budgetMaxMonthlySpendCents?: number;
        budgetAlertThresholdCents?: number;
        snapshotPolicyEveryNEvents?: number;
        snapshotPolicyEveryNSeconds?: number;
        snapshotPolicyOnFanInComplete?: boolean;
      } | null;
      createdAt: string;
      updatedAt: string;
    };
  }> {
    return this.withLogging(
      'update',
      { projectId: id, metadata: { projectId: id } },
      async () => {
        const project = await repo.updateProject(this.serviceCtx.db, id, {
          name: data.name,
          description: data.description,
          settings: data.settings,
        });
        if (!project) {
          throw new NotFoundError(`Project not found: ${id}`, 'project', id);
        }
        return { project };
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { projectId: id, metadata: { projectId: id } },
      async () => {
        const project = await repo.getProject(this.serviceCtx.db, id);
        if (!project) {
          throw new NotFoundError(`Project not found: ${id}`, 'project', id);
        }

        await repo.deleteProject(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
