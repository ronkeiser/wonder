/** Coordination service - abstracts DO access for workflow coordination */

import type { ServiceContext } from '~/infrastructure/context';
import type { Context, WorkflowTaskResult } from '../execution/definitions';

/**
 * Initialize a new workflow run in a fresh DO instance.
 * Creates a unique DO, stores initial state, and starts execution.
 */
export async function initializeWorkflow(
  ctx: ServiceContext,
  params: {
    workflowRunId: string;
    workflowDefId: string;
    workflowVersion: number;
    initialNodeId: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    context: Context;
  },
): Promise<string> {
  // Create unique DO instance for this workflow run
  const doId = ctx.do.newUniqueId();
  const durableObjectId = doId.toString();

  ctx.logger.info('initializing_workflow_coordinator', {
    workflow_run_id: params.workflowRunId,
    durable_object_id: durableObjectId,
  });

  try {
    // Get stub and call RPC method
    const stub = ctx.do.get(doId);
    await stub.initialize(params);

    ctx.logger.info('workflow_coordinator_initialized', {
      workflow_run_id: params.workflowRunId,
      durable_object_id: durableObjectId,
    });

    return durableObjectId;
  } catch (err) {
    ctx.logger.error('workflow_coordinator_init_failed', {
      workflow_run_id: params.workflowRunId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Submit a task result to the workflow coordinator.
 * Called by workers after completing task execution.
 */
export async function submitTaskResult(
  ctx: ServiceContext,
  durableObjectId: string,
  result: WorkflowTaskResult,
): Promise<void> {
  ctx.logger.info('submitting_task_result', {
    durable_object_id: durableObjectId,
    task_id: result.task_id,
    token_id: result.token_id,
    status: result.status,
  });

  try {
    const id = ctx.do.idFromString(durableObjectId);
    const stub = ctx.do.get(id);

    await stub.processTaskResult(result);

    ctx.logger.info('task_result_submitted', {
      durable_object_id: durableObjectId,
      task_id: result.task_id,
    });
  } catch (err) {
    ctx.logger.error('task_result_submission_failed', {
      durable_object_id: durableObjectId,
      task_id: result.task_id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Get pending events and context from coordinator for D1 persistence.
 * Called after workflow completion to flush state to D1.
 */
export async function getPendingData(
  ctx: ServiceContext,
  durableObjectId: string,
): Promise<{ events: unknown[]; context: Context | null }> {
  ctx.logger.info('getting_pending_data', {
    durable_object_id: durableObjectId,
  });

  try {
    const id = ctx.do.idFromString(durableObjectId);
    const stub = ctx.do.get(id);

    const data: { events: unknown[]; context: Context | null } = await stub.getPendingData();

    ctx.logger.info('pending_data_retrieved', {
      durable_object_id: durableObjectId,
      event_count: data.events.length,
      has_context: data.context !== null,
    });

    return data;
  } catch (err) {
    ctx.logger.error('get_pending_data_failed', {
      durable_object_id: durableObjectId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Get WebSocket connection for live event streaming.
 * This uses fetch() because WebSocket upgrade is actual HTTP protocol.
 */
export async function streamWorkflowEvents(
  ctx: ServiceContext,
  durableObjectId: string,
  request: Request,
): Promise<Response> {
  ctx.logger.info('websocket_stream_request', {
    durable_object_id: durableObjectId,
  });

  try {
    const id = ctx.do.idFromString(durableObjectId);
    const stub = ctx.do.get(id);

    // Forward WebSocket upgrade request to DO
    // This is legitimate use of fetch() - actual HTTP upgrade
    return await stub.fetch(request);
  } catch (err) {
    ctx.logger.error('websocket_stream_failed', {
      durable_object_id: durableObjectId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
