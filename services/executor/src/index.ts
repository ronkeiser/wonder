import { WorkerEntrypoint } from 'cloudflare:workers';

/**
 * Wonder Executor Service
 *
 * RPC-based task execution service.
 * Executes actions (LLM calls, HTTP requests, etc.) and returns results.
 */

/**
 * WorkflowTask - Task format for RPC
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
 * TaskResult - Result format returned via RPC
 */
interface TaskResult {
  task_id: string;
  workflow_run_id: string;
  token_id: string;
  node_id: string;
  success: boolean;
  output_data?: Record<string, unknown>;
  error?: string;
  completed_at: string;
}

/**
 * Executor service with RPC methods
 */
export default class ExecutorService extends WorkerEntrypoint<Env> {
  /**
   * RPC method - execute a task and return the result
   */
  async executeTask(task: WorkflowTask): Promise<TaskResult> {
    const executorStartTime = Date.now();
    console.log(`[Executor RPC t+0ms] executeTask called:`, JSON.stringify(task));

    try {
      // Execute the action based on kind
      console.log(`[Executor RPC t+${Date.now() - executorStartTime}ms] Executing action`);
      const result = await executeAction(task, this.env);
      console.log(
        `[Executor RPC t+${Date.now() - executorStartTime}ms] Action completed:`,
        JSON.stringify(result),
      );

      const taskResult: TaskResult = {
        task_id: `task-${task.token_id}-${Date.now()}`,
        workflow_run_id: task.workflow_run_id,
        token_id: task.token_id,
        node_id: task.node_id,
        success: true,
        output_data: result,
        completed_at: new Date().toISOString(),
      };

      console.log(`[Executor RPC t+${Date.now() - executorStartTime}ms] Returning result`);
      return taskResult;
    } catch (error) {
      console.error(`[Executor RPC] Task execution failed:`, error);

      return {
        task_id: `task-${task.token_id}-${Date.now()}`,
        workflow_run_id: task.workflow_run_id,
        token_id: task.token_id,
        node_id: task.node_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      };
    }
  }

  /**
   * HTTP handler for testing/health checks
   */
  async fetch(request: Request): Promise<Response> {
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
        note: 'This service executes tasks via RPC',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
/**
 * Execute an action based on its kind
 */
async function executeAction(task: WorkflowTask, env: Env): Promise<Record<string, unknown>> {
  switch (task.action_kind) {
    case 'llm_call':
      const aiStartTime = Date.now();
      const prompt = `You are a friendly assistant. User said: "${
        task.input_data.name || 'Hello'
      }". Respond in a warm, welcoming way.`;

      console.log(`[Executor AI t+0ms] Calling Workers AI`);

      const response = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })) as any;

      console.log(`[Executor AI t+${Date.now() - aiStartTime}ms] Workers AI call completed`);

      return {
        response: response?.response || 'Hello! How can I help you today?',
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
