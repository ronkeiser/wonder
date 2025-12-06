import { createLogger } from '@wonder/logs';
import type { ModelProfile } from '@wonder/resources/types';
import { WorkerEntrypoint } from 'cloudflare:workers';

/**
 * Wonder Executor Service
 *
 * RPC-based task execution service.
 * Executes actions with strongly-typed interfaces.
 */

export interface LLMCallParams {
  model_profile: ModelProfile;
  prompt: string;
  json_schema?: object; // JSON schema for structured output
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

    try {
      // Build AI.run options
      const aiOptions: any = {
        messages: [
          {
            role: 'user',
            content: params.prompt,
          },
        ],
        ...params.model_profile.parameters,
      };

      // Add response_format if json_schema provided
      if (params.json_schema) {
        aiOptions.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response_schema',
            strict: true,
            schema: params.json_schema,
          },
        };
      }

      this.logger.info({
        event_type: 'llm_call_started',
        message: 'LLM call started',
        trace_id: params.workflow_run_id,
        metadata: {
          model: params.model_profile.model_id,
          provider: params.model_profile.provider,
          prompt: params.prompt,
          prompt_length: params.prompt.length,
          parameters: params.model_profile.parameters,
          has_json_schema: !!params.json_schema,
          json_schema: params.json_schema,
          response_format: aiOptions.response_format,
          full_ai_options: aiOptions,
          workflow_run_id: params.workflow_run_id,
          token_id: params.token_id,
        },
      });

      const response = (await this.env.AI.run(
        params.model_profile.model_id as any,
        aiOptions,
      )) as any;

      const duration = Date.now() - startTime;
      const rawResponse = response?.response || 'No response from LLM';

      this.logger.info({
        event_type: 'llm_raw_response',
        message: 'Raw response from Workers AI',
        trace_id: params.workflow_run_id,
        metadata: {
          workflow_run_id: params.workflow_run_id,
          token_id: params.token_id,
          raw_response: rawResponse,
          response_type: typeof rawResponse,
          full_response: response,
        },
      });

      // When using json_schema, Workers AI returns parsed JSON automatically
      let result: { response: any };
      if (params.json_schema) {
        // Workers AI already parsed the JSON for us when response_format is set
        if (typeof rawResponse === 'object') {
          result = { response: rawResponse };

          this.logger.info({
            event_type: 'json_response_received',
            message: 'Structured JSON response received from Workers AI',
            trace_id: params.workflow_run_id,
            metadata: {
              workflow_run_id: params.workflow_run_id,
              token_id: params.token_id,
              response: rawResponse,
            },
          });
        } else {
          // Fallback: if it's still a string, try to parse it
          try {
            const parsed = JSON.parse(rawResponse);
            result = { response: parsed };

            this.logger.info({
              event_type: 'json_parsed_successfully',
              message: 'JSON response parsed from string',
              trace_id: params.workflow_run_id,
              metadata: {
                workflow_run_id: params.workflow_run_id,
                token_id: params.token_id,
                raw_response: rawResponse,
                parsed_response: parsed,
              },
            });
          } catch (parseError) {
            this.logger.error({
              event_type: 'json_parse_failed',
              message: 'Failed to parse JSON response',
              trace_id: params.workflow_run_id,
              metadata: {
                workflow_run_id: params.workflow_run_id,
                token_id: params.token_id,
                raw_response: rawResponse,
                error: parseError instanceof Error ? parseError.message : String(parseError),
              },
            });
            // Return raw response as fallback
            result = { response: rawResponse };
          }
        }
      } else {
        // No JSON schema - return raw string
        result = { response: rawResponse };
      }

      this.logger.info({
        event_type: 'llm_call_completed',
        message: 'LLM call completed successfully',
        trace_id: params.workflow_run_id,
        metadata: {
          model: params.model_profile.model_id,
          provider: params.model_profile.provider,
          duration_ms: duration,
          response_length:
            typeof result.response === 'string'
              ? result.response.length
              : JSON.stringify(result.response).length,
          workflow_run_id: params.workflow_run_id,
          token_id: params.token_id,
          output: result,
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
        trace_id: params.workflow_run_id,
        metadata: {
          model: params.model_profile.model_id,
          provider: params.model_profile.provider,
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
