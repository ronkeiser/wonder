/** Workflow Runs RPC resource */

import type { Broadcaster } from '@wonder/events';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { NotFoundError } from '~/shared/errors';
import * as schema from '~/schema';
import { Resource } from '~/shared/resource';
import { getDefinition } from '~/shared/definitions-repository';
import type { WorkflowDefContent } from '~/shared/content-schemas';
import * as workflowRepo from '../workflows/repository';
import * as repo from './repository';
import type { ListWorkflowRunsFilters, WorkflowRunSummary, WorkflowRunWithWorkspace } from './types';

export type { ListWorkflowRunsFilters, WorkflowRunSummary, WorkflowRunWithWorkspace } from './types';

export class WorkflowRuns extends Resource {
  async create(
    workflowId: string,
    input: Record<string, unknown>,
    options?: {
      rootRunId?: string; // For subworkflows - the top-level run ID
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

      const { workflow, definition } = result;
      const defContent = definition.content as WorkflowDefContent;

      // Get project to access workspace_id
      const project = await this.serviceCtx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, workflow.projectId))
        .get();
      if (!project) {
        throw new NotFoundError(`Project not found: ${workflow.projectId}`, 'project', workflow.projectId);
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
          nodeId: defContent.initialNodeId,
          status: 'ready',
          context: {},
        },
      ];

      // Create workflow run record (status: waiting until start is called)
      // For top-level runs, rootRunId equals the run's own ID
      // For subworkflows, rootRunId is passed from the parent context
      await workflowRepo.createWorkflowRun(this.serviceCtx.db, {
        id: workflowRunId,
        projectId: workflow.projectId,
        workflowId: workflow.id,
        definitionId: definition.id,
        definitionVersion: definition.version,
        status: 'waiting',
        context,
        activeTokens: activeTokens,
        durableObjectId: workflowRunId,
        rootRunId: options?.rootRunId ?? workflowRunId,
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

  /**
   * Create a workflow run directly from a definition.
   *
   * This bypasses the workflows table - useful for agent workflows
   * (context assembly, memory extraction) that are defined in libraries
   * and don't have project-specific workflow deployments.
   */
  async createFromDefinition(
    definitionId: string,
    input: Record<string, unknown>,
    options: {
      projectId: string;
      version?: number; // defaults to latest
      rootRunId?: string;
      parentRunId?: string;
      parentTokenId?: string;
    },
  ): Promise<{
    workflowRunId: string;
    projectId: string;
    workspaceId: string;
  }> {
    this.serviceCtx.logger.info({
      eventType: 'workflow_run.create_from_def.requested',
      metadata: { definitionId, projectId: options.projectId, version: options.version },
    });

    try {
      // Get definition directly (use specified version or latest)
      const definition = await getDefinition(this.serviceCtx.db, definitionId, options.version);
      if (!definition || definition.kind !== 'workflow_def') {
        this.serviceCtx.logger.warn({
          eventType: 'workflow_def.not_found',
          metadata: { definitionId, version: options.version },
        });
        throw new NotFoundError(
          `WorkflowDef not found: ${definitionId}${options.version ? ` version ${options.version}` : ''}`,
          'workflow_def',
          definitionId,
        );
      }

      const defContent = definition.content as WorkflowDefContent;

      // Get project to access workspace_id
      const project = await this.serviceCtx.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, options.projectId))
        .get();
      if (!project) {
        throw new NotFoundError(`Project not found: ${options.projectId}`, 'project', options.projectId);
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
          nodeId: defContent.initialNodeId,
          status: 'ready',
          context: {},
        },
      ];

      // Create workflow run record (workflowId is null for def-only runs)
      await repo.createWorkflowRunFromDef(this.serviceCtx.db, {
        id: workflowRunId,
        projectId: options.projectId,
        definitionId: definition.id,
        definitionVersion: definition.version,
        status: 'waiting',
        context,
        activeTokens: activeTokens,
        durableObjectId: workflowRunId,
        rootRunId: options.rootRunId ?? workflowRunId,
        parentRunId: options.parentRunId,
        parentTokenId: options.parentTokenId,
      });

      this.serviceCtx.logger.info({
        eventType: 'workflow_run.created_from_def',
        metadata: { definitionId, workflowRunId, version: definition.version },
      });

      return {
        workflowRunId,
        projectId: options.projectId,
        workspaceId: project.workspaceId,
      };
    } catch (error) {
      this.serviceCtx.logger.error({
        eventType: 'workflow_run.create_from_def.failed',
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          definitionId,
          projectId: options.projectId,
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  // Keep old method name for backwards compatibility
  async createFromWorkflowDef(
    workflowDefId: string,
    input: Record<string, unknown>,
    options: {
      projectId: string;
      version?: number;
      rootRunId?: string;
      parentRunId?: string;
      parentTokenId?: string;
    },
  ) {
    return this.createFromDefinition(workflowDefId, input, options);
  }

  async updateStatus(workflowRunId: string, status: 'running' | 'completed' | 'failed' | 'waiting'): Promise<void> {
    return this.withLogging(
      'updateStatus',
      { workflowRunId: workflowRunId, metadata: { workflowRunId: workflowRunId, status } },
      async () => {
        // Fetch workflow run first to get details for Broadcaster notification
        const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, workflowRunId);
        if (!workflowRun) {
          throw new NotFoundError(`Workflow run not found: ${workflowRunId}`, 'workflow_run', workflowRunId);
        }

        const updated = await repo.updateWorkflowRun(this.serviceCtx.db, workflowRunId, {
          status,
        });

        if (!updated) {
          throw new NotFoundError(`Workflow run not found: ${workflowRunId}`, 'workflow_run', workflowRunId);
        }

        // Notify Broadcaster about the status change
        const broadcaster = (this.env as unknown as { BROADCASTER: DurableObjectNamespace<Broadcaster> }).BROADCASTER;
        const broadcasterId = broadcaster.idFromName('global');
        const broadcasterStub = broadcaster.get(broadcasterId);
        broadcasterStub.notifyStatusChange({
          executionType: 'workflow',
          streamId: workflowRun.rootRunId,
          executionId: workflowRunId,
          definitionId: workflowRun.definitionId,
          parentExecutionId: workflowRun.parentRunId,
          status,
          timestamp: Date.now(),
        });
      },
    );
  }

  async get(id: string): Promise<{
    workflowRun: WorkflowRunWithWorkspace;
  }> {
    return this.withLogging('get', { workflowRunId: id, metadata: { workflowRunId: id } }, async () => {
      const workflowRun = await repo.getWorkflowRunWithProject(this.serviceCtx.db, id);
      if (!workflowRun) {
        throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
      }
      return { workflowRun };
    });
  }

  async complete(id: string, finalOutput: object): Promise<void> {
    return this.withLogging(
      'complete',
      { traceId: id, workflowRunId: id, metadata: { workflowRunId: id, finalOutput } },
      async () => {
        // Fetch workflow run first to get details for Broadcaster notification
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

        // Notify Broadcaster about the status change
        const broadcaster = (this.env as unknown as { BROADCASTER: DurableObjectNamespace<Broadcaster> }).BROADCASTER;
        const broadcasterId = broadcaster.idFromName('global');
        const broadcasterStub = broadcaster.get(broadcasterId);
        broadcasterStub.notifyStatusChange({
          executionType: 'workflow',
          streamId: workflowRun.rootRunId,
          executionId: id,
          definitionId: workflowRun.definitionId,
          parentExecutionId: workflowRun.parentRunId,
          status: 'completed',
          timestamp: Date.now(),
        });
      },
    );
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return this.withLogging('delete', { workflowRunId: id, metadata: { workflowRunId: id } }, async () => {
      const workflowRun = await repo.getWorkflowRun(this.serviceCtx.db, id);
      if (!workflowRun) {
        throw new NotFoundError(`Workflow run not found: ${id}`, 'workflow_run', id);
      }

      await repo.deleteWorkflowRun(this.serviceCtx.db, id);
      return { success: true };
    });
  }

  async list(filters: ListWorkflowRunsFilters = {}): Promise<{
    runs: WorkflowRunSummary[];
    total: number;
    limit: number;
    offset: number;
  }> {
    return this.withLogging('list', { metadata: { filters } }, async () => {
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
    });
  }
}
