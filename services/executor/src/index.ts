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
}

export interface LLMCallResult {
  response: string;
}

/**
 * Executor service with RPC methods
 */
export default class ExecutorService extends WorkerEntrypoint<Env> {
  private readonly logContext = {
    service: 'wonder-executor',
    environment: 'production',
  } as const;

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
  }

  /**
   * RPC method - call LLM with given parameters
   */
  async llmCall(params: LLMCallParams): Promise<LLMCallResult> {
    const startTime = Date.now();

    await this.env.LOGS.info(this.logContext, {
      event_type: 'llm_call_started',
      message: 'LLM call started',
      metadata: {
        model: params.model,
        prompt_length: params.prompt.length,
        temperature: params.temperature,
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

      await this.env.LOGS.info(this.logContext, {
        event_type: 'llm_call_completed',
        message: 'LLM call completed successfully',
        metadata: {
          model: params.model,
          duration_ms: duration,
          response_length: result.response.length,
        },
      });

      return result;
    } catch (error) {
      await this.env.LOGS.error(this.logContext, {
        event_type: 'llm_call_failed',
        message: 'LLM call failed',
        metadata: {
          model: params.model,
          duration_ms: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        },
      });
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
