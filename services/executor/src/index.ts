import { createLogger } from '@wonder/logs';
import type { ModelProfile } from '@wonder/resources/types';
import { WorkerEntrypoint } from 'cloudflare:workers';

/**
 * Wonder Executor Service
 *
 * RPC-based task execution service.
 * Implements the 5-layer execution model: loads TaskDef, iterates Steps, executes Actions.
 */

/**
 * TaskPayload - from Coordinator per execution-model.md
 */
export interface TaskPayload {
  token_id: string; // For result correlation
  workflow_run_id: string; // For sub-workflow context
  task_id: string; // TaskDef to execute
  task_version: number;
  input: Record<string, unknown>; // Mapped from workflow context

  // Resource mappings (generic_name → container_do_id)
  resources?: Record<string, string>;

  // Execution config
  timeout_ms?: number;
  retry_attempt?: number; // Current retry count (for retry logic)
}

/**
 * TaskResult - to Coordinator per execution-model.md
 */
export interface TaskResult {
  token_id: string;
  success: boolean;
  output: Record<string, unknown>;

  error?: {
    type: 'step_failure' | 'task_timeout' | 'validation_error';
    step_ref?: string;
    message: string;
    retryable: boolean;
  };

  metrics: {
    duration_ms: number;
    steps_executed: number;
    llm_tokens?: {
      input: number;
      output: number;
      cost_usd: number;
    };
  };
}

// Legacy interface - to be removed after migration
export interface LLMCallParams {
  model_profile: ModelProfile;
  prompt: string;
  json_schema?: object;
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
   * RPC method - Execute a task (fire-and-forget, calls back to coordinator)
   *
   * This is the main entry point for task execution per the 5-layer model.
   * Loads TaskDef, iterates Steps, executes Actions, and returns result.
   *
   * @see docs/architecture/executor.md
   */
  async executeTask(payload: TaskPayload): Promise<void> {
    const startTime = Date.now();

    this.logger.info({
      event_type: 'task_execution_started',
      message: 'Task execution started',
      trace_id: payload.workflow_run_id,
      metadata: {
        token_id: payload.token_id,
        task_id: payload.task_id,
        task_version: payload.task_version,
        input_keys: Object.keys(payload.input),
        has_resources: payload.resources ? Object.keys(payload.resources).length > 0 : false,
      },
    });

    try {
      // Load task definition from Resources
      using taskDefsResource = this.env.RESOURCES.taskDefs();
      const { task_def } = await taskDefsResource.get(payload.task_id, payload.task_version);

      // TODO: Validate input against task_def.input_schema

      // Initialize task context
      const context = {
        input: {
          ...payload.input,
          _workflow_run_id: payload.workflow_run_id,
          _token_id: payload.token_id,
          _resources: payload.resources || {},
        },
        state: {} as Record<string, unknown>,
        output: {} as Record<string, unknown>,
      };

      // Execute steps sequentially
      let stepsExecuted = 0;

      for (const step of task_def.steps.sort(
        (a: { ordinal: number }, b: { ordinal: number }) => a.ordinal - b.ordinal,
      )) {
        this.logger.info({
          event_type: 'step_execution_started',
          message: `Executing step: ${step.ref}`,
          trace_id: payload.workflow_run_id,
          metadata: {
            token_id: payload.token_id,
            step_id: step.id,
            step_ref: step.ref,
            step_ordinal: step.ordinal,
            action_id: step.action_id,
          },
        });

        // TODO: Evaluate step.condition
        // TODO: Apply step.input_mapping
        // TODO: Load ActionDef and execute
        // TODO: Apply step.output_mapping
        // TODO: Handle step.on_failure

        stepsExecuted++;
      }

      // TODO: Validate output against task_def.output_schema

      const duration = Date.now() - startTime;

      this.logger.info({
        event_type: 'task_execution_completed',
        message: 'Task execution completed successfully',
        trace_id: payload.workflow_run_id,
        metadata: {
          token_id: payload.token_id,
          task_id: payload.task_id,
          duration_ms: duration,
          steps_executed: stepsExecuted,
          output_keys: Object.keys(context.output),
        },
      });

      // Callback to coordinator with result
      const coordinatorId = this.env.COORDINATOR.idFromName(payload.workflow_run_id);
      const coordinator = this.env.COORDINATOR.get(coordinatorId);
      await coordinator.handleTaskResult(payload.token_id, {
        output_data: context.output,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error({
        event_type: 'task_execution_failed',
        message: 'Task execution failed',
        trace_id: payload.workflow_run_id,
        metadata: {
          token_id: payload.token_id,
          task_id: payload.task_id,
          duration_ms: duration,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      // TODO: Callback with error result and determine retryable
      throw error;
    }
  }

  /**
   * RPC method - call LLM with given parameters (fire-and-forget, calls back to coordinator)
   *
   * @deprecated Use executeTask instead. This is a legacy method that will be removed.
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
