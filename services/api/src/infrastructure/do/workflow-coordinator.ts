/**
 * WorkflowCoordinator Durable Object - thin infrastructure wrapper.
 *
 * This DO provides:
 * - HTTP routing to execution service methods
 * - SqlStorage access for the coordination service
 * - Queue binding for task distribution
 *
 * All business logic lives in domains/execution/service.ts (WorkflowCoordinationService).
 */

import { createLogger } from '@wonder/logger';
import type { Context } from '~/domains/execution/definitions';
import { WorkflowCoordinationService } from '~/domains/execution/service';
import type { WorkflowTaskResult } from '../queue/types';

export class WorkflowCoordinator implements DurableObject {
  private service: WorkflowCoordinationService;

  constructor(private state: DurableObjectState, private env: Env) {
    // Initialize coordination service with console-only logger (no D1 access in DO)
    const logger = createLogger({ consoleOnly: true });
    this.service = new WorkflowCoordinationService(
      this.state.storage.sql,
      this.env.WORKFLOW_QUEUE,
      logger,
    );
  }

  /**
   * HTTP routing for DO communication.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      // Initialize workflow execution
      if (url.pathname === '/execute' && request.method === 'POST') {
        const params = (await request.json()) as {
          workflowRunId: string;
          workflowDefId: string;
          workflowVersion: number;
          initialNodeId: string;
          inputSchema: Record<string, unknown>;
          outputSchema: Record<string, unknown>;
          context: Context;
          durableObjectId: string;
        };
        this.service.initializeWorkflow(params);
        return Response.json({ success: true });
      }

      // Receive task result from worker
      if (url.pathname === '/task-result' && request.method === 'POST') {
        const result = (await request.json()) as WorkflowTaskResult;
        this.service.processTaskResult(result);
        return Response.json({ success: true });
      }

      // Get pending data for D1 persistence
      if (url.pathname === '/pending-data' && request.method === 'GET') {
        const events = this.service.getPendingEvents();
        const context = this.service.getFinalContext();
        return Response.json({
          events,
          context,
          status: 'completed',
          workflow_run_id: this.service.getWorkflowRunId(),
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return Response.json({ error: errorMessage }, { status: 500 });
    }
  }
}

/**
 * Environment bindings for WorkflowCoordinator.
 */
interface Env {
  WORKFLOW_QUEUE: Queue;
  ENVIRONMENT?: string;
}
