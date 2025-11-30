import * as executionService from '~/domains/execution/service';
import * as graphService from '~/domains/graph/service';
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
    const workflow = await graphService.createWorkflow(this.serviceCtx, data);
    return {
      workflow_id: workflow.id,
      workflow,
    };
  }

  /**
   * Get a workflow by ID
   */
  async get(workflowId: string) {
    const workflow = await graphService.getWorkflow(this.serviceCtx, workflowId);
    return { workflow };
  }

  /**
   * Start a workflow execution
   */
  async start(workflowId: string, input: Record<string, unknown>) {
    const workflowRun = await executionService.startWorkflow(this.serviceCtx, workflowId, input);
    return {
      workflow_run_id: workflowRun.id,
      durable_object_id: workflowRun.durable_object_id,
    };
  }

  /**
   * Get workflow run status and output
   */
  async getWorkflowRun(workflowRunId: string) {
    const workflowRun = await executionService.getWorkflowRun(this.serviceCtx, workflowRunId);
    return { workflow_run: workflowRun };
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
