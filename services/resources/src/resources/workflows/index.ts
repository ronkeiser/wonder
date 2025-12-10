/** Workflows RPC resource */

import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import * as schema from '~/infrastructure/db/schema';
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
    this.serviceCtx.logger.info({
      event_type: 'workflow_create_started',
      project_id: data.project_id,
      metadata: { name: data.name },
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

      this.serviceCtx.logger.info({
        event_type: 'workflow_created',
        metadata: { workflow_id: workflow.id, name: workflow.name },
      });

      return {
        workflow_id: workflow.id,
        workflow,
      };
    } catch (error) {
      const dbError = extractDbError(error);

      if (dbError.constraint === 'unique') {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_create_conflict',
          project_id: data.project_id,
          metadata: { name: data.name, field: dbError.field },
        });
        throw new ConflictError(
          `Workflow with ${dbError.field} already exists`,
          dbError.field,
          'unique',
        );
      }

      if (dbError.constraint === 'foreign_key') {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_create_invalid_reference',
          project_id: data.project_id,
          metadata: { workflow_def_id: data.workflow_def_id },
        });
        throw new NotFoundError(
          'Referenced project or workflow_def does not exist',
          'reference',
          data.workflow_def_id,
        );
      }

      this.serviceCtx.logger.error({
        event_type: 'workflow_create_failed',
        project_id: data.project_id,
        message: dbError.message,
        metadata: { name: data.name },
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
    this.serviceCtx.logger.info({
      event_type: 'workflow_get',
      metadata: { workflow_id: id },
    });

    const workflow = await repo.getWorkflow(this.serviceCtx.db, id);
    if (!workflow) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_not_found',
        metadata: { workflow_id: id },
      });
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
    this.serviceCtx.logger.info({
      event_type: 'workflow_list',
      project_id: params?.project_id,
      metadata: { limit: params?.limit },
    });

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
    this.serviceCtx.logger.info({
      event_type: 'workflow_update_started',
      metadata: { workflow_id: id },
    });

    const workflow = await repo.updateWorkflow(this.serviceCtx.db, id, data);
    if (!workflow) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_not_found',
        metadata: { workflow_id: id },
      });
      throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
    }

    this.serviceCtx.logger.info({
      event_type: 'workflow_updated',
      metadata: { workflow_id: workflow.id, name: workflow.name },
    });

    return { workflow };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_delete_started',
      metadata: { workflow_id: id },
    });

    // Verify workflow exists
    const workflow = await repo.getWorkflow(this.serviceCtx.db, id);
    if (!workflow) {
      this.serviceCtx.logger.warn({
        event_type: 'workflow_not_found',
        metadata: { workflow_id: id },
      });
      throw new NotFoundError(`Workflow not found: ${id}`, 'workflow', id);
    }

    await repo.deleteWorkflow(this.serviceCtx.db, id);
    this.serviceCtx.logger.info({
      event_type: 'workflow_deleted',
      metadata: { workflow_id: id },
    });

    return { success: true };
  }

  async createRun(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<{
    workflow_run_id: string;
    project_id: string;
    workspace_id: string;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_run_create_requested',
      metadata: { workflow_id: workflowId },
    });

    try {
      // Get workflow and its definition
      const result = await repo.getWorkflowWithDef(this.serviceCtx.db, workflowId);
      if (!result) {
        this.serviceCtx.logger.warn({
          event_type: 'workflow_not_found',
          metadata: { workflow_id: workflowId },
        });
        throw new NotFoundError(`Workflow not found: ${workflowId}`, 'workflow', workflowId);
      }

      const { workflow, workflow_def } = result;

      // Get project to access workspace_id
      const project = await this.serviceCtx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, workflow.project_id))
        .get();
      if (!project) {
        throw new NotFoundError(
          `Project not found: ${workflow.project_id}`,
          'project',
          workflow.project_id,
        );
      }

      // Generate workflow_run_id (ULID)
      const workflowRunId = ulid();

      // Initialize context with input
      const context = {
        input,
        state: {},
        output: {},
        artifacts: [],
      };

      // Initialize with a single token at the initial node
      const activeTokens = [
        {
          id: ulid(),
          node_id: workflow_def.initial_node_id,
          status: 'ready',
          context: {},
        },
      ];

      // Create workflow run record (status: pending, not running yet)
      await repo.createWorkflowRun(this.serviceCtx.db, {
        id: workflowRunId,
        project_id: workflow.project_id,
        workflow_id: workflow.id,
        workflow_def_id: workflow_def.id,
        workflow_version: workflow_def.version,
        status: 'pending',
        context,
        active_tokens: activeTokens,
        durable_object_id: workflowRunId,
      });

      this.serviceCtx.logger.info({
        event_type: 'workflow_run_created',
        metadata: { workflow_id: workflowId, workflow_run_id: workflowRunId },
      });

      return {
        workflow_run_id: workflowRunId,
        project_id: workflow.project_id,
        workspace_id: project.workspace_id,
      };
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: 'workflow_run_create_failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          workflow_id: workflowId,
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  async startRun(
    workflowId: string,
    workflowRunId: string,
  ): Promise<{
    durable_object_id: string;
  }> {
    this.serviceCtx.logger.info({
      event_type: 'workflow_run_start_requested',
      metadata: { workflow_id: workflowId, workflow_run_id: workflowRunId },
    });

    try {
      // Get the workflow run
      const run = await this.serviceCtx.db
        .select()
        .from(schema.workflow_runs)
        .where(eq(schema.workflow_runs.id, workflowRunId))
        .get();

      if (!run) {
        throw new NotFoundError(
          `Workflow run not found: ${workflowRunId}`,
          'workflow_run',
          workflowRunId,
        );
      }

      // Verify it belongs to this workflow
      if (run.workflow_id !== workflowId) {
        throw new ConflictError(
          `Workflow run ${workflowRunId} does not belong to workflow ${workflowId}`,
          'workflow_id',
          'mismatch',
        );
      }

      // Get project to access workspace_id
      const project = await this.serviceCtx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, run.project_id))
        .get();
      if (!project) {
        throw new NotFoundError(`Project not found: ${run.project_id}`, 'project', run.project_id);
      }

      // Update status to running
      await this.serviceCtx.db
        .update(schema.workflow_runs)
        .set({ status: 'running', updated_at: new Date().toISOString() })
        .where(eq(schema.workflow_runs.id, workflowRunId))
        .run();

      // Trigger workflow execution via coordinator DO (RPC)
      const coordinatorId = this.env.COORDINATOR.idFromName(workflowRunId);
      const coordinator = this.env.COORDINATOR.get(coordinatorId);

      await coordinator.start(run.context.input, {
        workflow_run_id: workflowRunId,
        workspace_id: project.workspace_id,
        project_id: run.project_id,
        workflow_def_id: run.workflow_def_id,
      });

      this.serviceCtx.logger.info({
        event_type: 'workflow_run_started',
        metadata: { workflow_id: workflowId, workflow_run_id: workflowRunId },
      });

      return {
        durable_object_id: workflowRunId,
      };
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: 'workflow_run_start_failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          workflow_id: workflowId,
          workflow_run_id: workflowRunId,
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  async start(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<{
    workflow_run_id: string;
    durable_object_id: string;
  }> {
    // Convenience method: create + start in one call
    const { workflow_run_id, project_id, workspace_id } = await this.createRun(workflowId, input);
    const { durable_object_id } = await this.startRun(workflowId, workflow_run_id);
    return { workflow_run_id, durable_object_id };
  }
}
