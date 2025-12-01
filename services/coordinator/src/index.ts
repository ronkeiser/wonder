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
    const queueStartTime = Date.now();
    console.log(`[Coordinator Queue t+0ms] ===== QUEUE CONSUMER INVOKED =====`);
    console.log(`[Coordinator Queue t+0ms] Processing batch of ${batch.messages.length} messages`);

    // Group results by workflow_run_id and track which messages correspond to each
    const resultsByWorkflow = new Map<
      string,
      { results: TaskResult[]; messages: Message<TaskResult>[] }
    >();

    for (const message of batch.messages) {
      const result = message.body;
      console.log(
        `[Coordinator Queue t+${Date.now() - queueStartTime}ms] Received result:`,
        JSON.stringify(result),
      );
      const existing = resultsByWorkflow.get(result.workflow_run_id) || {
        results: [],
        messages: [],
      };
      existing.results.push(result);
      existing.messages.push(message);
      resultsByWorkflow.set(result.workflow_run_id, existing);
    }
    console.log(`[Coordinator Queue t+${Date.now() - queueStartTime}ms] Grouped ${resultsByWorkflow.size} workflows`);

    // Process each workflow's results in its DO via RPC
    for (const [workflowRunId, { results, messages }] of resultsByWorkflow) {
      try {
        console.log(
          `[Coordinator Queue t+${
            Date.now() - queueStartTime
          }ms] Getting DO stub for workflow: ${workflowRunId}`,
        );
        const id = env.COORDINATOR.idFromName(workflowRunId);
        console.log(
          `[Coordinator Queue t+${
            Date.now() - queueStartTime
          }ms] DO id created, getting stub`,
        );
        const stub = env.COORDINATOR.get(id);
        console.log(
          `[Coordinator Queue t+${
            Date.now() - queueStartTime
          }ms] Stub obtained, calling processResults RPC`,
        );

        // Call the DO method directly via RPC
        await stub.processResults(results);
        console.log(
          `[Coordinator Queue t+${Date.now() - queueStartTime}ms] processResults RPC returned successfully`,
        );

        // Only ack messages after successful processing
        console.log(
          `[Coordinator Queue t+${Date.now() - queueStartTime}ms] Acknowledging ${messages.length} messages`,
        );
        for (const message of messages) {
          message.ack();
        }
        console.log(
          `[Coordinator Queue t+${Date.now() - queueStartTime}ms] Messages acknowledged`,
        );
      } catch (error) {
        console.error(
          `[Coordinator Queue t+${Date.now() - queueStartTime}ms] Failed to process results for workflow ${workflowRunId}:`,
          error,
        );
        // Don't ack - let the messages retry
        for (const message of messages) {
          message.retry();
        }
      }
    }
    console.log(`[Coordinator Queue t+${Date.now() - queueStartTime}ms] ===== QUEUE CONSUMER COMPLETE =====`);
  },
};
