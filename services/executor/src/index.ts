import { createLogger } from '@wonder/logs';
import { WorkerEntrypoint } from 'cloudflare:workers';

/**
 * Wonder Executor Service
 *
 * RPC-based task execution service.
 * Executes actions with strongly-typed interfaces.
 */

export interface LLMCallParams {
  model: string;
  prompt: string;
  temperature?: number;
  // Callback info for async execution
  workflow_run_id: string;
  token_id: string;
}

export interface LLMCallResult {
  response: string;
}

/**
 * Executor service with RPC methods
 */
export default class ExecutorService extends WorkerEntrypoint<Env> {
  private logger = createLogger(this.ctx, this.env.LOGS, {
    service: 'executor',
    environment: 'production',
  });

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
  }

  /**
   * RPC method - call LLM with given parameters (fire-and-forget, calls back to coordinator)
   */
  async llmCall(params: LLMCallParams): Promise<void> {
    const startTime = Date.now();

    this.logger.info({
      event_type: 'llm_call_started',
      message: 'LLM call started',
      metadata: {
        model: params.model,
        prompt: params.prompt,
        prompt_length: params.prompt.length,
        temperature: params.temperature,
        workflow_run_id: params.workflow_run_id,
        token_id: params.token_id,
      },
    });

    try {
      const response = (await this.env.AI.run(params.model as any, {
        messages: [
          {
            role: 'user',
            content: params.prompt,
          },
        ],
        temperature: params.temperature,
      })) as any;

      const duration = Date.now() - startTime;
      const result = {
        response: response?.response || 'No response from LLM',
      };

      this.logger.info({
        event_type: 'llm_call_completed',
        message: 'LLM call completed successfully',
        metadata: {
          model: params.model,
          duration_ms: duration,
          response_length: result.response.length,
          workflow_run_id: params.workflow_run_id,
          token_id: params.token_id,
        },
      });

      // Callback to coordinator with result
      const coordinatorId = this.env.COORDINATOR.idFromName(params.workflow_run_id);
      const coordinator = this.env.COORDINATOR.get(coordinatorId);
      await coordinator.handleTaskResult(params.token_id, { output_data: result });
    } catch (error) {
      this.logger.error({
        event_type: 'llm_call_failed',
        message: 'LLM call failed',
        metadata: {
          model: params.model,
          duration_ms: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          workflow_run_id: params.workflow_run_id,
          token_id: params.token_id,
        },
      });

      // TODO: Callback with error result
      throw error;
    }
  }

  /**
   * Minimal fetch handler (required by Workers runtime)
   */
  async fetch(): Promise<Response> {
    return new Response('Executor Service - RPC only', { status: 200 });
  }
}
