/** Workflow Runs RPC resource */

import type { EventHub } from '@wonder/events';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { NotFoundError } from '~/shared/errors';
import * as schema from '~/schema';
import { Resource } from '~/shared/resource';
import * as workflowRepo from '../workflows/repository';
import * as repo from './repository';
import type {
  ListWorkflowRunsFilters,
  WorkflowRunSummary,
  WorkflowRunWithWorkspace,
} from './types';

export type { ListWorkflowRunsFilters, WorkflowRunSummary, WorkflowRunWithWorkspace } from './types';

export class WorkflowRuns extends Resource {
  async create(
    workflowId: string,
    input: Record<string, unknown>,
    options?: {
      parentRunId?: string;
      parentTokenId?: string;
    },
  ): Promise<{
    workflowRunId: string;
    projectId: string;
    workspaceId: string;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'workflow_run.create.requested',
      metadata: { workflowId: workflowId },
    });

    try {
      // Get workflow and its definition
      const result = await workflowRepo.getWorkflowWithDef(this.serviceCtx.db, workflowId);
      if (!result) {
        this.serviceCtx.logger.warn({
          eventType: 'workflow.not_found',
          metadata: { workflowId: workflowId },
        });
        throw new NotFoundError(`Workflow not found: ${workflowId}`, 'workflow', workflowId);
      }

      const { workflow, workflowDef } = result;

      // Get project to access workspace_id
      const project = await this.serviceCtx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, workflow.projectId))
        .get();
      if (!project) {
        throw new NotFoundError(
          `Project not found: ${workflow.projectId}`,
          'project',
          workflow.projectId,
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
          nodeId: workflowDef.initialNodeId,
          status: 'ready',
          context: {},
        },
      ];

      // Create workflow run record (status: waiting until start is called)
      await workflowRepo.createWorkflowRun(this.serviceCtx.db, {
        id: workflowRunId,
        projectId: workflow.projectId,
        workflowId: workflow.id,
        workflowDefId: workflowDef.id,
        workflowVersion: workflowDef.version,
        status: 'waiting',
        context,
        activeTokens: activeTokens,
        durableObjectId: workflowRunId,
        parentRunId: options?.parentRunId,
        parentTokenId: options?.parentTokenId,
      });

      this.serviceCtx.logger.info({
        eventType: 'workflow_run.created',
        metadata: { workflowId: workflowId, workflowRunId: workflowRunId },
      });

      return {
        workflowRunId: workflowRunId,
        projectId: workflow.projectId,
        workspaceId: project.workspaceId,
      };
    } catch (error) {
      this.serviceCtx.logger.error({
        eventType: 'workflow_run.create.failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          workflowId: workflowId,
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
      { workflowRunId: workflowRunId, metadata: { workflowRunId: workflowRunId, status } },
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
          workflowRunId: workflowRunId,
          workflowDefId: workflowRun.workflowDefId,
          projectId: workflowRun.projectId,
          parentRunId: workflowRun.parentRunId,
          status,
          timestamp: Date.now(),
        });
      },
    );
  }

  async get(id: string): Promise<{
    workflowRun: WorkflowRunWithWorkspace;
  }> {
    return this.withLogging(
      'get',
      { workflowRunId: id, metadata: { workflowRunId: id } },
      async () => {
        const workflowRun = await repo.getWorkflowRunWithProject(this.serviceCtx.db, id);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }
        return { workflowRun };
      },
    );
  }

  async complete(id: string, finalOutput: object): Promise<void> {
    return this.withLogging(
      'complete',
      { traceId: id, workflowRunId: id, metadata: { workflowRunId: id, finalOutput } },
      async () => {
        // Fetch workflow run first to get details for EventHub notification
        const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, id);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
        }

        const updated = await repo.updateWorkflowRun(this.serviceCtx.db, id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          context: { finalOutput },
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
          workflowRunId: id,
          workflowDefId: workflowRun.workflowDefId,
          projectId: workflowRun.projectId,
          parentRunId: workflowRun.parentRunId,
          status: 'completed',
          timestamp: Date.now(),
        });
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging(
      'delete',
      { workflowRunId: id, metadata: { workflowRunId: id } },
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

        // Return summary (exclude heavy fields)
        const summaries: WorkflowRunSummary[] = runs.map(
          ({ context, activeTokens, latestSnapshot, durableObjectId, ...summary }) => summary,
        );

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
