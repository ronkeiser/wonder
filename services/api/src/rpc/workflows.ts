import { eq } from 'drizzle-orm';
import { startWorkflow } from '~/domains/execution/service';
import * as graphRepo from '~/domains/graph/repository';
import { workflow_runs } from '~/infrastructure/db/schema';
import { Resource } from './resource';

/**
 * Workflows RPC resource
 * Exposes workflow operations for RPC calls from web service
 */
export class Workflows extends Resource {
  /**
   * Create a new workflow (binds a workflow_def to a project)
   */
  async create(data: {
    project_id: string;
    name: string;
    description?: string;
    workflow_def_id: string;
    pinned_version?: number;
    enabled?: boolean;
  }) {
    const workflow = await graphRepo.createWorkflow(this.serviceCtx.db, {
      project_id: data.project_id,
      name: data.name,
      description: data.description || data.name,
      workflow_def_id: data.workflow_def_id,
      pinned_version: data.pinned_version ?? null,
      enabled: data.enabled ?? true,
    });

    return {
      workflow_id: workflow.id,
      workflow,
    };
  }

  /**
   * Get a workflow by ID
   */
  async get(workflowId: string) {
    const workflow = await graphRepo.getWorkflow(this.serviceCtx.db, workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    return { workflow };
  }

  /**
   * Start a workflow execution
   */
  async start(workflowId: string, input: Record<string, unknown>) {
    const workflowRun = await startWorkflow(this.serviceCtx, workflowId, input);
    return {
      workflow_run_id: workflowRun.id,
      durable_object_id: workflowRun.durable_object_id,
    };
  }

  /**
   * Get workflow run status and output
   */
  async getWorkflowRun(workflowRunId: string) {
    const result = await this.serviceCtx.db
      .select({
        id: workflow_runs.id,
        workflow_id: workflow_runs.workflow_id,
        status: workflow_runs.status,
        context: workflow_runs.context,
        created_at: workflow_runs.created_at,
        updated_at: workflow_runs.updated_at,
        completed_at: workflow_runs.completed_at,
      })
      .from(workflow_runs)
      .where(eq(workflow_runs.id, workflowRunId))
      .get();

    if (!result) {
      throw new Error(`Workflow run not found: ${workflowRunId}`);
    }

    return { workflow_run: result };
  }

  /**
   * Stream coordinator events via WebSocket
   * Forwards WebSocket upgrade request to the Durable Object
   */
  async streamCoordinator(doId: string, request: Request): Promise<Response> {
    const id = this.env.WORKFLOW_COORDINATOR.idFromString(doId);
    const stub = this.env.WORKFLOW_COORDINATOR.get(id);

    // Create new request with /stream path for DO
    const doUrl = new URL(request.url);
    doUrl.pathname = '/stream';
    const doRequest = new Request(doUrl, request);

    return await stub.fetch(doRequest);
  }
}
