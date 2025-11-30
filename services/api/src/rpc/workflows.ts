import { startWorkflow } from '~/domains/execution/service';
import * as graphRepo from '~/domains/graph/repository';
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
