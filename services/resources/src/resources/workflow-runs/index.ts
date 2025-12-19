/** Workflow Runs RPC resource */

import type { EventHub } from '@wonder/events';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { NotFoundError } from '~/shared/errors';
import * as schema from '~/schema';
import { Resource } from '~/shared/resource';
import * as workflowRepo from '../workflows/repository';
import * as repo from './repository';
import type { ListWorkflowRunsFilters, WorkflowRunSummary } from './types';

export type { ListWorkflowRunsFilters, WorkflowRunSummary } from './types';

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
      event_type: 'workflow_run.create.requested',
      metadata: { workflow_id: workflowId },
    });

    try {
      // Get workflow and its definition
      const result = await workflowRepo.getWorkflowWithDef(this.serviceCtx.db, workflowId);
      if (!result) {
        this.serviceCtx.logger.warn({
          event_type: 'workflow.not_found',
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
        event_type: 'workflow_run.created',
        metadata: { workflow_id: workflowId, workflow_run_id: workflowRunId },
      });

      return {
        workflow_run_id: workflowRunId,
        project_id: workflow.project_id,
        workspace_id: project.workspace_id,
      };
    } catch (error) {
      this.serviceCtx.logger.error({
        event_type: 'workflow_run.create.failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          workflow_id: workflowId,
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  async updateStatus(
    workflowRunId: string,
    status: 'running' | 'completed' | 'failed' | 'waiting',
  ): Promise<void> {
    return this.withLogging(
      'updateStatus',
      { workflow_run_id: workflowRunId, metadata: { workflow_run_id: workflowRunId, status } },
      async () => {
        // Fetch workflow run first to get details for EventHub notification
        const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, workflowRunId);
        if (!workflowRun) {
          throw new NotFoundError(
            `Workflow run not found: ${workflowRunId}`,
            'workflow_run',
            workflowRunId,
          );
        }

        const updated = await repo.updateWorkflowRun(this.serviceCtx.db, workflowRunId, {
          status,
        });

        if (!updated) {
          throw new NotFoundError(
            `Workflow run not found: ${workflowRunId}`,
            'workflow_run',
            workflowRunId,
          );
        }

        // Notify EventHub about the status change
        const eventHub = (this.env as unknown as { EVENT_HUB: DurableObjectNamespace<EventHub> })
          .EVENT_HUB;
        const hubId = eventHub.idFromName('global');
        const hubStub = eventHub.get(hubId);
        hubStub.notifyStatusChange({
          workflow_run_id: workflowRunId,
          workflow_def_id: workflowRun.workflow_def_id,
          project_id: workflowRun.project_id,
          parent_run_id: workflowRun.parent_run_id,
          status,
          timestamp: Date.now(),
        });
      },
    );
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
        // Fetch workflow run first to get details for EventHub notification
        const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, id);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }

        const updated = await repo.updateWorkflowRun(this.serviceCtx.db, id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          context: { final_output },
        });

        if (!updated) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }

        // Notify EventHub about the status change
        const eventHub = (this.env as unknown as { EVENT_HUB: DurableObjectNamespace<EventHub> })
          .EVENT_HUB;
        const hubId = eventHub.idFromName('global');
        const hubStub = eventHub.get(hubId);
        hubStub.notifyStatusChange({
          workflow_run_id: id,
          workflow_def_id: workflowRun.workflow_def_id,
          project_id: workflowRun.project_id,
          parent_run_id: workflowRun.parent_run_id,
          status: 'completed',
          timestamp: Date.now(),
        });
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

  async list(filters: ListWorkflowRunsFilters = {}): Promise<{
    runs: WorkflowRunSummary[];
    total: number;
    limit: number;
    offset: number;
  }> {
    return this.withLogging(
      'list',
      { metadata: { filters } },
      async () => {
        const { runs, total } = await repo.listWorkflowRuns(this.serviceCtx.db, filters);

        // Return summary (exclude heavy fields like context, active_tokens, latest_snapshot)
        const summaries: WorkflowRunSummary[] = runs.map((run) => ({
          id: run.id,
          project_id: run.project_id,
          workflow_id: run.workflow_id,
          workflow_name: run.workflow_name,
          workflow_def_id: run.workflow_def_id,
          workflow_version: run.workflow_version,
          status: run.status as WorkflowRunSummary['status'],
          parent_run_id: run.parent_run_id,
          created_at: run.created_at,
          updated_at: run.updated_at,
          completed_at: run.completed_at,
        }));

        return {
          runs: summaries,
          total,
          limit: filters.limit ?? 50,
          offset: filters.offset ?? 0,
        };
      },
    );
  }
}
