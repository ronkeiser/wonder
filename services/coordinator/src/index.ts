/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle, token state, and task distribution.
 */

import { DurableObject } from 'cloudflare:workers';
import { ContextManager } from './context.js';
import { handleTaskResults } from './results.js';
import { TokenManager } from './tokens.js';
import type { TaskResult } from './types.js';

interface Env {
  COORDINATOR: DurableObjectNamespace<WorkflowCoordinator>;
}

/**
 * WorkflowCoordinator Durable Object
 */
export class WorkflowCoordinator extends DurableObject {
  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          id: this.ctx.id.toString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Process task results
   */
  async processResults(results: TaskResult[]): Promise<void> {
    const context = new ContextManager(this.ctx.storage.sql);
    const tokens = new TokenManager(this.ctx.storage.sql);
    await handleTaskResults(results, context, tokens);
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    console.log(`Alarm triggered for DO: ${this.ctx.id.toString()}`);
  }
}

/**
 * Worker entrypoint for testing DO access
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('OK', {
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * Queue consumer handler for task results
   */
  async queue(batch: MessageBatch<TaskResult>, env: Env): Promise<void> {
    // Group results by workflow_run_id
    const resultsByWorkflow = new Map<string, TaskResult[]>();

    for (const message of batch.messages) {
      const result = message.body;
      const existing = resultsByWorkflow.get(result.workflow_run_id) || [];
      existing.push(result);
      resultsByWorkflow.set(result.workflow_run_id, existing);
    }

    // Process each workflow's results in its DO
    for (const [workflowRunId, results] of resultsByWorkflow) {
      const id = env.COORDINATOR.idFromName(workflowRunId);
      const stub = env.COORDINATOR.get(id);
      await stub.processResults(results);
    }
  },
};
