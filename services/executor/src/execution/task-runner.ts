/**
 * Task Runner - Main task execution loop
 *
 * Loads TaskDef, executes all steps in sequence, returns result.
 *
 * @see docs/architecture/executor.md
 */

import type { Emitter } from '@wonder/events';
import type { Logger } from '@wonder/logs';
import type { Task } from '@wonder/resources/types';
import type { TaskPayload, TaskResult } from '../index';
import { executeStep } from './step-executor';
import type { ExecutionMetrics, TaskContext } from './types';
import { StepFailureError, TaskRetryError } from './types';

export interface TaskRunnerDeps {
  logger: Logger;
  emitter: Emitter;
  env: Env;
}

/**
 * Execute a task from payload to result
 */
export async function runTask(
  payload: TaskPayload,
  task: Task,
  deps: TaskRunnerDeps,
): Promise<TaskResult> {
  const { logger, emitter } = deps;
  const startTime = Date.now();

  // Initialize metrics
  const metrics: ExecutionMetrics = {
    duration_ms: 0,
    steps_executed: 0,
    steps_skipped: 0,
  };

  // Initialize task context
  const context: TaskContext = {
    input: {
      ...payload.input,
      _workflow_run_id: payload.workflow_run_id,
      _token_id: payload.token_id,
      _resources: payload.resources || {},
    },
    state: {},
    output: {},
  };

  try {
    // TODO: Validate input against task.input_schema

    // Sort steps by ordinal
    const sortedSteps = [...task.steps].sort((a, b) => a.ordinal - b.ordinal);

    logger.info({
      event_type: 'task_runner_started',
      message: `Running task with ${sortedSteps.length} steps`,
      trace_id: payload.workflow_run_id,
      metadata: {
        token_id: payload.token_id,
        task_id: task.id,
        task_version: task.version,
        step_count: sortedSteps.length,
      },
    });

    // Emit trace event for task started
    emitter.emitTrace({
      type: 'executor.task.started',
      token_id: payload.token_id,
      payload: {
        task_id: task.id,
        task_version: task.version,
        step_count: sortedSteps.length,
        input_keys: Object.keys(payload.input),
      },
    });

    // Execute steps sequentially
    for (const step of sortedSteps) {
      logger.info({
        event_type: 'step_started',
        message: `Executing step ${step.ordinal}: ${step.ref}`,
        trace_id: payload.workflow_run_id,
        metadata: {
          token_id: payload.token_id,
          step_ref: step.ref,
          step_ordinal: step.ordinal,
          action_id: step.action_id,
        },
      });

      const stepResult = await executeStep(step, context, {
        logger,
        emitter,
        env: deps.env,
        workflowRunId: payload.workflow_run_id,
        tokenId: payload.token_id,
      });

      if (stepResult.skipped) {
        metrics.steps_skipped++;
        logger.info({
          event_type: 'step_skipped',
          message: `Step skipped: ${step.ref}`,
          trace_id: payload.workflow_run_id,
          metadata: {
            step_ref: step.ref,
            skip_reason: stepResult.skipReason,
          },
        });
      } else {
        metrics.steps_executed++;
        logger.info({
          event_type: 'step_completed',
          message: `Step completed: ${step.ref}`,
          trace_id: payload.workflow_run_id,
          metadata: {
            step_ref: step.ref,
            success: stepResult.success,
          },
        });
      }
    }

    // TODO: Validate output against task.output_schema

    metrics.duration_ms = Date.now() - startTime;

    // Emit trace event for task completed
    emitter.emitTrace({
      type: 'executor.task.completed',
      token_id: payload.token_id,
      duration_ms: metrics.duration_ms,
      payload: {
        task_id: task.id,
        task_version: task.version,
        steps_executed: metrics.steps_executed,
        steps_skipped: metrics.steps_skipped,
        output: context.output,
      },
    });

    logger.info({
      event_type: 'task_runner_completed',
      message: 'Task completed successfully',
      trace_id: payload.workflow_run_id,
      metadata: {
        token_id: payload.token_id,
        task_id: task.id,
        duration_ms: metrics.duration_ms,
        steps_executed: metrics.steps_executed,
        steps_skipped: metrics.steps_skipped,
        context_output: context.output,
        context_output_keys: Object.keys(context.output),
      },
    });

    return {
      token_id: payload.token_id,
      success: true,
      output: context.output,
      metrics: {
        duration_ms: metrics.duration_ms,
        steps_executed: metrics.steps_executed,
        llm_tokens: metrics.llm_tokens,
      },
    };
  } catch (error) {
    metrics.duration_ms = Date.now() - startTime;

    if (error instanceof TaskRetryError) {
      logger.warn({
        event_type: 'task_retry_requested',
        message: `Task retry requested by step: ${error.stepRef}`,
        trace_id: payload.workflow_run_id,
        metadata: {
          token_id: payload.token_id,
          step_ref: error.stepRef,
          error: error.message,
        },
      });

      return {
        token_id: payload.token_id,
        success: false,
        output: {},
        error: {
          type: 'step_failure',
          step_ref: error.stepRef,
          message: error.message,
          retryable: true,
        },
        metrics: {
          duration_ms: metrics.duration_ms,
          steps_executed: metrics.steps_executed,
        },
      };
    }

    if (error instanceof StepFailureError) {
      logger.error({
        event_type: 'task_step_failure',
        message: `Task failed at step: ${error.stepRef}`,
        trace_id: payload.workflow_run_id,
        metadata: {
          token_id: payload.token_id,
          step_ref: error.stepRef,
          error: error.message,
          retryable: error.retryable,
        },
      });

      return {
        token_id: payload.token_id,
        success: false,
        output: {},
        error: {
          type: 'step_failure',
          step_ref: error.stepRef,
          message: error.message,
          retryable: error.retryable,
        },
        metrics: {
          duration_ms: metrics.duration_ms,
          steps_executed: metrics.steps_executed,
        },
      };
    }

    // Unexpected error
    logger.error({
      event_type: 'task_unexpected_error',
      message: 'Task failed with unexpected error',
      trace_id: payload.workflow_run_id,
      metadata: {
        token_id: payload.token_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return {
      token_id: payload.token_id,
      success: false,
      output: {},
      error: {
        type: 'step_failure',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
      metrics: {
        duration_ms: metrics.duration_ms,
        steps_executed: metrics.steps_executed,
      },
    };
  }
}
