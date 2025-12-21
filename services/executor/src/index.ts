import { createEmitter } from '@wonder/events';
import { createLogger } from '@wonder/logs';
import type { ModelProfile } from '@wonder/resources/types';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { runTask } from './execution/task-runner';

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
  tokenId: string; // For result correlation
  workflowRunId: string; // For sub-workflow context
  projectId: string; // For trace event context
  taskId: string; // TaskDef to execute
  taskVersion: number;
  input: Record<string, unknown>; // Mapped from workflow context

  // Resource mappings (generic_name → container_do_id)
  resources?: Record<string, string>;

  // Execution config
  timeoutMs?: number;
  retryAttempt?: number; // Current retry count (for retry logic)

  // Observability config
  traceEvents?: boolean; // Enable/disable trace events for this task
}

/**
 * TaskResult - to Coordinator per execution-model.md
 */
export interface TaskResult {
  tokenId: string;
  success: boolean;
  output: Record<string, unknown>;

  error?: {
    type: 'step_failure' | 'task_timeout' | 'validation_error';
    stepRef?: string;
    message: string;
    retryable: boolean;
  };

  metrics: {
    durationMs: number;
    stepsExecuted: number;
    llmTokens?: {
      input: number;
      output: number;
      costUsd: number;
    };
  };
}

// Legacy interface - to be removed after migration
export interface LLMCallParams {
  modelProfile: ModelProfile;
  prompt: string;
  jsonSchema?: object;
  workflowRunId: string;
  tokenId: string;
}

export interface LLMCallResult {
  response: string;
}

/**
 * Executor service with RPC methods
 */
export default class ExecutorService extends WorkerEntrypoint<Env> {
  private logger = createLogger(this.ctx, this.env.LOGS, {
    service: this.env.SERVICE,
    environment: this.env.ENVIRONMENT,
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
    // Determine if trace events are enabled:
    // - If explicitly set in payload, use that value
    // - Otherwise fall back to env var
    const traceEnabled =
      payload.traceEvents !== undefined
        ? payload.traceEvents
        : (this.env.TRACE_EVENTS_ENABLED as string) === 'true';

    // Create emitter for this task execution - uses Streamer DO for event writes
    const emitter = createEmitter(
      this.env.STREAMER,
      {
        workflowRunId: payload.workflowRunId,
        projectId: payload.projectId,
        workflowDefId: '',
        parentRunId: null,
      },
      { traceEnabled },
    );

    this.logger.info({
      eventType: 'task_execution_started',
      message: 'Task execution started',
      traceId: payload.workflowRunId,
      metadata: {
        tokenId: payload.tokenId,
        taskId: payload.taskId,
        taskVersion: payload.taskVersion,
        inputKeys: Object.keys(payload.input),
        hasResources: payload.resources ? Object.keys(payload.resources).length > 0 : false,
      },
    });

    // Mark token as executing (ack to coordinator that we received the task)
    const coordinatorId = this.env.COORDINATOR.idFromName(payload.workflowRunId);
    const coordinator = this.env.COORDINATOR.get(coordinatorId);
    await coordinator.markTokenExecuting(payload.tokenId);

    try {
      // Load task definition from Resources
      using tasksResource = this.env.RESOURCES.tasks();
      const { task } = await tasksResource.get(payload.taskId, payload.taskVersion);

      // Execute the task using the task runner
      const result = await runTask(payload, task, {
        logger: this.logger,
        emitter,
        env: this.env,
      });

      // Callback to coordinator with result
      const coordinatorId = this.env.COORDINATOR.idFromName(payload.workflowRunId);
      const coordinator = this.env.COORDINATOR.get(coordinatorId);

      if (result.success) {
        this.logger.info({
          eventType: 'task_result_sending',
          message: 'Sending task result to coordinator',
          traceId: payload.workflowRunId,
          metadata: {
            tokenId: payload.tokenId,
            outputData: result.output,
            outputKeys: result.output ? Object.keys(result.output) : [],
          },
        });
        await coordinator.handleTaskResult(payload.tokenId, {
          outputData: result.output,
        });
      } else {
        // Send error to coordinator (may trigger retry if retryable)
        await coordinator.handleTaskError(payload.tokenId, {
          error: result.error!,
          metrics: result.metrics,
        });
      }
    } catch (error) {
      this.logger.error({
        eventType: 'task_execution_failed',
        message: 'Task execution failed with unexpected error',
        traceId: payload.workflowRunId,
        metadata: {
          tokenId: payload.tokenId,
          taskId: payload.taskId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      // Callback with error result
      const coordinatorId = this.env.COORDINATOR.idFromName(payload.workflowRunId);
      const coordinator = this.env.COORDINATOR.get(coordinatorId);
      await coordinator.handleTaskError(payload.tokenId, {
        error: {
          type: 'step_failure',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
        metrics: {
          durationMs: 0,
          stepsExecuted: 0,
        },
      });
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
        ...params.modelProfile.parameters,
      };

      // Add response_format if jsonSchema provided
      if (params.jsonSchema) {
        aiOptions.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response_schema',
            strict: true,
            schema: params.jsonSchema,
          },
        };
      }

      this.logger.info({
        eventType: 'llm_call_started',
        message: 'LLM call started',
        traceId: params.workflowRunId,
        metadata: {
          model: params.modelProfile.modelId,
          provider: params.modelProfile.provider,
          prompt: params.prompt,
          promptLength: params.prompt.length,
          parameters: params.modelProfile.parameters,
          hasJsonSchema: !!params.jsonSchema,
          jsonSchema: params.jsonSchema,
          responseFormat: aiOptions.response_format,
          fullAiOptions: aiOptions,
          workflowRunId: params.workflowRunId,
          tokenId: params.tokenId,
        },
      });

      const response = (await this.env.AI.run(
        params.modelProfile.modelId as any,
        aiOptions,
      )) as any;

      const duration = Date.now() - startTime;
      const rawResponse = response?.response || 'No response from LLM';

      this.logger.info({
        eventType: 'llm_raw_response',
        message: 'Raw response from Workers AI',
        traceId: params.workflowRunId,
        metadata: {
          workflowRunId: params.workflowRunId,
          tokenId: params.tokenId,
          rawResponse: rawResponse,
          responseType: typeof rawResponse,
          fullResponse: response,
        },
      });

      // When using jsonSchema, Workers AI returns parsed JSON automatically
      let result: { response: any };
      if (params.jsonSchema) {
        // Workers AI already parsed the JSON for us when response_format is set
        if (typeof rawResponse === 'object') {
          result = { response: rawResponse };

          this.logger.info({
            eventType: 'json_response_received',
            message: 'Structured JSON response received from Workers AI',
            traceId: params.workflowRunId,
            metadata: {
              workflowRunId: params.workflowRunId,
              tokenId: params.tokenId,
              response: rawResponse,
            },
          });
        } else {
          // Fallback: if it's still a string, try to parse it
          try {
            const parsed = JSON.parse(rawResponse);
            result = { response: parsed };

            this.logger.info({
              eventType: 'json_parsed_successfully',
              message: 'JSON response parsed from string',
              traceId: params.workflowRunId,
              metadata: {
                workflowRunId: params.workflowRunId,
                tokenId: params.tokenId,
                rawResponse: rawResponse,
                parsedResponse: parsed,
              },
            });
          } catch (parseError) {
            this.logger.error({
              eventType: 'json_parse_failed',
              message: 'Failed to parse JSON response',
              traceId: params.workflowRunId,
              metadata: {
                workflowRunId: params.workflowRunId,
                tokenId: params.tokenId,
                rawResponse: rawResponse,
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
        eventType: 'llm_call_completed',
        message: 'LLM call completed successfully',
        traceId: params.workflowRunId,
        metadata: {
          model: params.modelProfile.modelId,
          provider: params.modelProfile.provider,
          durationMs: duration,
          responseLength:
            typeof result.response === 'string'
              ? result.response.length
              : JSON.stringify(result.response).length,
          workflowRunId: params.workflowRunId,
          tokenId: params.tokenId,
          output: result,
        },
      });

      // Callback to coordinator with result
      const coordinatorId = this.env.COORDINATOR.idFromName(params.workflowRunId);
      const coordinator = this.env.COORDINATOR.get(coordinatorId);
      await coordinator.handleTaskResult(params.tokenId, { outputData: result });
    } catch (error) {
      this.logger.error({
        eventType: 'llm_call_failed',
        message: 'LLM call failed',
        traceId: params.workflowRunId,
        metadata: {
          model: params.modelProfile.modelId,
          provider: params.modelProfile.provider,
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          workflowRunId: params.workflowRunId,
          tokenId: params.tokenId,
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
