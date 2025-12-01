/**
 * Wonder Executor Service
 *
 * Queue consumer for workflow task execution.
 * Executes actions (LLM calls, HTTP requests, etc.) and returns results.
 */

/**
 * WorkflowTask - Message format for queue
 */
interface WorkflowTask {
  workflow_run_id: string;
  token_id: string;
  node_id: string;
  action_kind: string;
  input_data: Record<string, unknown>;
  retry_count: number;
}

/**
 * Queue consumer - processes workflow tasks
 */
export default {
  async queue(batch: MessageBatch<WorkflowTask>, env: Env): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} tasks`);

    for (const message of batch.messages) {
      const task = message.body;

      try {
        console.log(`Executing task: ${task.node_id} (${task.action_kind})`);
        console.log(`Workflow run: ${task.workflow_run_id}, Token: ${task.token_id}`);
        console.log(`Input data:`, task.input_data);

        // Execute the action based on kind
        const result = await executeAction(task);

        console.log(`Task completed successfully:`, result);

        // In production: send result back to coordinator
        // await sendResultToCoordinator(task, result);

        // Acknowledge the message
        message.ack();
      } catch (error) {
        console.error(`Task execution failed:`, error);

        // Retry or send to DLQ based on retry count
        if (task.retry_count < 3) {
          console.log(`Retrying task (attempt ${task.retry_count + 1})`);
          message.retry();
        } else {
          console.log(`Max retries reached, moving to DLQ`);
          message.ack(); // Let it go to DLQ
        }
      }
    }
  },

  /**
   * HTTP handler for testing/health checks
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          service: 'executor',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        message: 'Wonder Executor Service',
        note: 'This service processes tasks from the workflow-tasks queue',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  },
};

/**
 * Execute an action based on its kind
 */
async function executeAction(task: WorkflowTask): Promise<Record<string, unknown>> {
  // Hello world implementation - just echo the input
  switch (task.action_kind) {
    case 'llm_call':
      return {
        response: `LLM response for: ${JSON.stringify(task.input_data)}`,
        tokens_used: 42,
      };

    case 'http_request':
      return {
        status: 200,
        body: `HTTP response for: ${JSON.stringify(task.input_data)}`,
      };

    case 'update_context':
      return {
        updated: true,
        ...task.input_data,
      };

    default:
      return {
        executed: true,
        action_kind: task.action_kind,
        input: task.input_data,
      };
  }
}
