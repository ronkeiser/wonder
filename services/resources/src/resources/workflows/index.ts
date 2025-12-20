/** Workflows RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/shared/errors';
import { Resource } from '~/shared/resource';
import * as repo from './repository';
import type { Workflow, WorkflowInput, WorkflowUpdate } from './types';

export class Workflows extends Resource {
  async create(data: WorkflowInput): Promise<{
    workflowId: string;
    workflow: Workflow;
  }> {
    return this.withLogging(
      'create',
      { projectId: data.projectId, metadata: { projectId: data.projectId, name: data.name } },
      async () => {
        try {
          const workflow = await repo.createWorkflow(this.serviceCtx.db, data);

          return {
            workflowId: workflow.id,
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
              data.workflowDefId,
            );
          }

          throw error;
        }
      },
    );
  }

  async get(id: string): Promise<{
    workflow: Workflow;
  }> {
    return this.withLogging('get', { workflowId: id, metadata: { workflowId: id } }, async () => {
      const workflow = await repo.getWorkflow(this.serviceCtx.db, id);
      if (!workflow) {
        throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
      }
      return { workflow };
    });
  }

  async list(params?: { limit?: number; projectId?: string }): Promise<{
    workflows: Workflow[];
  }> {
    return this.withLogging(
      'list',
      { projectId: params?.projectId, metadata: { limit: params?.limit } },
      async () => {
        const workflowsResult = params?.projectId
          ? await repo.listWorkflowsByProject(this.serviceCtx.db, params.projectId, params.limit)
          : await repo.listWorkflows(this.serviceCtx.db, params?.limit);

        return { workflows: workflowsResult };
      },
    );
  }

  async update(id: string, data: WorkflowUpdate): Promise<{
    workflow: Workflow;
  }> {
    return this.withLogging(
      'update',
      { workflowId: id, metadata: { workflowId: id } },
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
      { workflowId: id, metadata: { workflowId: id } },
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
