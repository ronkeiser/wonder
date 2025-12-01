/** Workflows RPC resource */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import { Resource } from '../base';
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
    this.serviceCtx.logger.info('workflow_create_started', {
      project_id: data.project_id,
      name: data.name,
    });

    try {
      const workflow = await repo.createWorkflow(this.serviceCtx.db, {
        project_id: data.project_id,
        name: data.name,
        description: data.description ?? data.name,
        workflow_def_id: data.workflow_def_id,
        pinned_version: data.pinned_version ?? null,
        enabled: data.enabled ?? true,
      });

      this.serviceCtx.logger.info('workflow_created', {
        workflow_id: workflow.id,
        name: workflow.name,
      });

      return {
        workflow_id: workflow.id,
        workflow,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn('workflow_create_conflict', {
          project_id: data.project_id,
          name: data.name,
          field: dbError.field,
        });
        throw new ConflictError(
          `Workflow with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      if (dbError.constraint === 'foreign_key') {
        this.serviceCtx.logger.warn('workflow_create_invalid_reference', {
          project_id: data.project_id,
          workflow_def_id: data.workflow_def_id,
        });
        throw new NotFoundError(
          'Referenced project or workflow_def does not exist',
          'reference',
          data.workflow_def_id,
        );
      }

      this.serviceCtx.logger.error('workflow_create_failed', {
        project_id: data.project_id,
        name: data.name,
        error: dbError.message,
      });
      throw error;
    }
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
    this.serviceCtx.logger.info('workflow_get', { workflow_id: id });

    const workflow = await repo.getWorkflow(this.serviceCtx.db, id);
    if (!workflow) {
      this.serviceCtx.logger.warn('workflow_not_found', { workflow_id: id });
      throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
    }

    return { workflow };
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
    this.serviceCtx.logger.info('workflow_list', params);

    const workflowsResult = params?.project_id
      ? await repo.listWorkflowsByProject(this.serviceCtx.db, params.project_id, params.limit)
      : await repo.listWorkflows(this.serviceCtx.db, params?.limit);

    return { workflows: workflowsResult };
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
    this.serviceCtx.logger.info('workflow_update_started', { workflow_id: id });

    const workflow = await repo.updateWorkflow(this.serviceCtx.db, id, data);
    if (!workflow) {
      this.serviceCtx.logger.warn('workflow_not_found', { workflow_id: id });
      throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
    }

    this.serviceCtx.logger.info('workflow_updated', {
      workflow_id: workflow.id,
      name: workflow.name,
    });

    return { workflow };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info('workflow_delete_started', { workflow_id: id });

    // Verify workflow exists
    const workflow = await repo.getWorkflow(this.serviceCtx.db, id);
    if (!workflow) {
      this.serviceCtx.logger.warn('workflow_not_found', { workflow_id: id });
      throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
    }

    await repo.deleteWorkflow(this.serviceCtx.db, id);
    this.serviceCtx.logger.info('workflow_deleted', { workflow_id: id });

    return { success: true };
  }
}
