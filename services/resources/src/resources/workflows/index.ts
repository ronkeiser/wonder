/** Workflows RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';

export class Workflows extends Resource {
  async create(data: {
    project_id: string;
    name: string;
    description?: string;
    workflow_def_id: string;
    pinned_version?: number;
    enabled?: boolean;
  }): Promise<{
    workflow_id: string;
    workflow: {
      id: string;
      project_id: string;
      name: string;
      description: string;
      workflow_def_id: string;
      pinned_version: number | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging(
      'create',
      { project_id: data.project_id, metadata: { project_id: data.project_id, name: data.name } },
      async () => {
        try {
          const workflow = await repo.createWorkflow(this.serviceCtx.db, {
            project_id: data.project_id,
            name: data.name,
            description: data.description ?? data.name,
            workflow_def_id: data.workflow_def_id,
            pinned_version: data.pinned_version ?? null,
            enabled: data.enabled ?? true,
          });

          return {
            workflow_id: workflow.id,
            workflow,
          };
        } catch (error) {
          const dbError = extractDbError(error);

          if (dbError.constraint === 'unique') {
            throw new ConflictError(
              `Workflow with ${dbError.field} already exists`,
              dbError.field,
              'unique',
            );
          }

          if (dbError.constraint === 'foreign_key') {
            throw new NotFoundError(
              'Referenced project or workflow_def does not exist',
              'reference',
              data.workflow_def_id,
            );
          }

          throw error;
        }
      },
    );
  }

  async get(id: string): Promise<{
    workflow: {
      id: string;
      project_id: string;
      name: string;
      description: string;
      workflow_def_id: string;
      pinned_version: number | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging('get', { workflow_id: id, metadata: { workflow_id: id } }, async () => {
      const workflow = await repo.getWorkflow(this.serviceCtx.db, id);
      if (!workflow) {
        throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
      }
      return { workflow };
    });
  }

  async list(params?: { limit?: number; project_id?: string }): Promise<{
    workflows: Array<{
      id: string;
      project_id: string;
      name: string;
      description: string;
      workflow_def_id: string;
      pinned_version: number | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>;
  }> {
    return this.withLogging(
      'list',
      { project_id: params?.project_id, metadata: { limit: params?.limit } },
      async () => {
        const workflowsResult = params?.project_id
          ? await repo.listWorkflowsByProject(this.serviceCtx.db, params.project_id, params.limit)
          : await repo.listWorkflows(this.serviceCtx.db, params?.limit);

        return { workflows: workflowsResult };
      },
    );
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      pinned_version?: number;
      enabled?: boolean;
    },
  ): Promise<{
    workflow: {
      id: string;
      project_id: string;
      name: string;
      description: string;
      workflow_def_id: string;
      pinned_version: number | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    };
  }> {
    return this.withLogging(
      'update',
      { workflow_id: id, metadata: { workflow_id: id } },
      async () => {
        const workflow = await repo.updateWorkflow(this.serviceCtx.db, id, data);
        if (!workflow) {
          throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
        }
        return { workflow };
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { workflow_id: id, metadata: { workflow_id: id } },
      async () => {
        const workflow = await repo.getWorkflow(this.serviceCtx.db, id);
        if (!workflow) {
          throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
        }

        await repo.deleteWorkflow(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
