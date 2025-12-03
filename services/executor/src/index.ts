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
  /**
   * RPC method - call LLM with given parameters
   */
  async llmCall(params: LLMCallParams): Promise<LLMCallResult> {
    const startTime = Date.now();
    console.log(`[Executor] llmCall started:`, JSON.stringify(params));

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

      console.log(`[Executor] llmCall completed in ${Date.now() - startTime}ms`);

      return {
        response: response?.response || 'No response from LLM',
      };
    } catch (error) {
      console.error(`[Executor] llmCall failed:`, error);
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
