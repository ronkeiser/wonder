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
  async queue(batch: MessageBatch<WorkflowTask>, env: Env, ctx: ExecutionContext): Promise<void> {
    const executorStartTime = Date.now();
    console.log(`[Executor t+0ms] Queue handler called!`);
    console.log(`[Executor t+0ms] Processing batch of ${batch.messages.length} tasks`);

    for (const message of batch.messages) {
      const task = message.body;

      try {
        console.log(
          `[Executor t+${Date.now() - executorStartTime}ms] Executing task:`,
          JSON.stringify(task),
        );

        // Execute the action based on kind
        const result = await executeAction(task, env);

        console.log(
          `[Executor t+${Date.now() - executorStartTime}ms] Task completed successfully:`,
          JSON.stringify(result),
        );

        // Send result back to coordinator via results queue
        const taskResult = {
          task_id: `task-${task.token_id}-${Date.now()}`,
          workflow_run_id: task.workflow_run_id,
          token_id: task.token_id,
          node_id: task.node_id,
          success: true,
          output_data: result,
          completed_at: new Date().toISOString(),
        };

        console.log(
          `[Executor t+${Date.now() - executorStartTime}ms] Sending result to RESULTS queue:`,
          JSON.stringify(taskResult),
        );
        await env.RESULTS.send(taskResult);
        console.log(`[Executor t+${Date.now() - executorStartTime}ms] Result sent successfully`);

        // Acknowledge the message only after result is queued
        message.ack();
        console.log(`[Executor t+${Date.now() - executorStartTime}ms] Message acknowledged`);
      } catch (error) {
        console.error(`[Executor] Task execution failed:`, error);

        // Retry the message (don't ack on failure)
        message.retry();
        console.log(`[Executor] Message will be retried`);
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
async function executeAction(task: WorkflowTask, env: Env): Promise<Record<string, unknown>> {
  switch (task.action_kind) {
    case 'llm_call':
      // TEMPORARILY MOCKED - Workers AI call suspended for timing test
      const aiStartTime = Date.now();
      const prompt = `You are a friendly assistant. User said: "${
        task.input_data.name || 'Hello'
      }". Respond in a warm, welcoming way.`;

      console.log(`[Executor AI t+0ms] MOCK: Skipping Workers AI call`);
      
      // Mock response instead of actual AI call
      // const response = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
      //   messages: [
      //     {
      //       role: 'user',
      //       content: prompt,
      //     },
      //   ],
      // })) as any;
      
      console.log(`[Executor AI t+${Date.now() - aiStartTime}ms] MOCK: Returning mock response`);

      return {
        response: `MOCK: Hello! This is a mock response for testing timing. Input was: ${task.input_data.name || 'Hello'}`,
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
