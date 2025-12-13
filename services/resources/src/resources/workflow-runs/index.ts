/** Workflow Runs RPC resource */

import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { ConflictError, NotFoundError } from '~/errors';
import * as schema from '~/infrastructure/db/schema';
import { Resource } from '../base';
import * as workflowRepo from '../workflows/repository';
import * as repo from './repository';

export class WorkflowRuns extends Resource {
  async create(
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
      const result = await workflowRepo.getWorkflowWithDef(this.serviceCtx.db, workflowId);
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

      // Create workflow run record (status: waiting until start is called)
      await workflowRepo.createWorkflowRun(this.serviceCtx.db, {
        id: workflowRunId,
        project_id: workflow.project_id,
        workflow_id: workflow.id,
        workflow_def_id: workflow_def.id,
        workflow_version: workflow_def.version,
        status: 'waiting',
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

  async start(
    workflowRunId: string,
    workflowId?: string,
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

      // Verify it belongs to this workflow (if workflowId provided)
      if (workflowId && run.workflow_id !== workflowId) {
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

      await coordinator.start(workflowRunId);

      this.serviceCtx.logger.info({
        event_type: 'workflow_run_started',
        metadata: { workflow_id: workflowId ?? run.workflow_id, workflow_run_id: workflowRunId },
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

  async get(id: string): Promise<{
    workflow_run: {
      id: string;
      project_id: string;
      workspace_id: string;
      workflow_id: string;
      workflow_def_id: string;
      workflow_version: number;
      status: string;
      context: object;
      active_tokens: object[];
      durable_object_id: string;
      parent_run_id: string | null;
      parent_node_id: string | null;
      latest_snapshot: object | null;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    };
  }> {
    return this.withLogging(
      'get',
      { workflow_run_id: id, metadata: { workflow_run_id: id } },
      async () => {
        const workflowRun = await repo.getWorkflowRunWithProject(this.serviceCtx.db, id);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }
        return { workflow_run: workflowRun };
      },
    );
  }

  async complete(id: string, final_output: object): Promise<void> {
    return this.withLogging(
      'complete',
      { trace_id: id, workflow_run_id: id, metadata: { workflow_run_id: id, final_output } },
      async () => {
        const updated = await repo.updateWorkflowRun(this.serviceCtx.db, id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          context: { final_output },
        });

        if (!updated) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { workflow_run_id: id, metadata: { workflow_run_id: id } },
      async () => {
        const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, id);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }

        await repo.deleteWorkflowRun(this.serviceCtx.db, id);
        return { success: true };
      },
    );
  }
}
