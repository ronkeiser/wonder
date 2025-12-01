/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle, token state, and task distribution.
 */

import type { TaskResult } from './types.js';

// Export Durable Objects (required for Workers runtime)
export { WorkflowCoordinator } from './coordinator';

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
