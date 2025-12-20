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
    durationMs: 0,
    stepsExecuted: 0,
    stepsSkipped: 0,
  };

  // Initialize task context
  const context: TaskContext = {
    input: {
      ...payload.input,
      _workflowRunId: payload.workflowRunId,
      _tokenId: payload.tokenId,
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
      eventType: 'task_runner_started',
      message: `Running task with ${sortedSteps.length} steps`,
      traceId: payload.workflowRunId,
      metadata: {
        tokenId: payload.tokenId,
        taskId: task.id,
        taskVersion: task.version,
        stepCount: sortedSteps.length,
      },
    });

    // Emit trace event for task started
    emitter.emitTrace({
      type: 'executor.task.started',
      tokenId: payload.tokenId,
      payload: {
        taskId: task.id,
        taskVersion: task.version,
        stepCount: sortedSteps.length,
        inputKeys: Object.keys(payload.input),
      },
    });

    // Execute steps sequentially
    for (const step of sortedSteps) {
      logger.info({
        eventType: 'step_started',
        message: `Executing step ${step.ordinal}: ${step.ref}`,
        traceId: payload.workflowRunId,
        metadata: {
          tokenId: payload.tokenId,
          stepRef: step.ref,
          stepOrdinal: step.ordinal,
          actionId: step.actionId,
        },
      });

      const stepResult = await executeStep(step, context, {
        logger,
        emitter,
        env: deps.env,
        workflowRunId: payload.workflowRunId,
        tokenId: payload.tokenId,
      });

      if (stepResult.skipped) {
        metrics.stepsSkipped++;
        logger.info({
          eventType: 'step_skipped',
          message: `Step skipped: ${step.ref}`,
          traceId: payload.workflowRunId,
          metadata: {
            stepRef: step.ref,
            skipReason: stepResult.skipReason,
          },
        });
      } else {
        metrics.stepsExecuted++;
        logger.info({
          eventType: 'step_completed',
          message: `Step completed: ${step.ref}`,
          traceId: payload.workflowRunId,
          metadata: {
            stepRef: step.ref,
            success: stepResult.success,
          },
        });
      }
    }

    // TODO: Validate output against task.output_schema

    metrics.durationMs = Date.now() - startTime;

    // Emit trace event for task completed
    emitter.emitTrace({
      type: 'executor.task.completed',
      tokenId: payload.tokenId,
      durationMs: metrics.durationMs,
      payload: {
        taskId: task.id,
        taskVersion: task.version,
        stepsExecuted: metrics.stepsExecuted,
        stepsSkipped: metrics.stepsSkipped,
        output: context.output,
      },
    });

    logger.info({
      eventType: 'task_runner_completed',
      message: 'Task completed successfully',
      traceId: payload.workflowRunId,
      metadata: {
        tokenId: payload.tokenId,
        taskId: task.id,
        durationMs: metrics.durationMs,
        stepsExecuted: metrics.stepsExecuted,
        stepsSkipped: metrics.stepsSkipped,
        contextOutput: context.output,
        contextOutputKeys: Object.keys(context.output),
      },
    });

    return {
      tokenId: payload.tokenId,
      success: true,
      output: context.output,
      metrics: {
        durationMs: metrics.durationMs,
        stepsExecuted: metrics.stepsExecuted,
        llmTokens: metrics.llmTokens,
      },
    };
  } catch (error) {
    metrics.durationMs = Date.now() - startTime;

    if (error instanceof TaskRetryError) {
      logger.warn({
        eventType: 'task_retry_requested',
        message: `Task retry requested by step: ${error.stepRef}`,
        traceId: payload.workflowRunId,
        metadata: {
          tokenId: payload.tokenId,
          stepRef: error.stepRef,
          error: error.message,
        },
      });

      return {
        tokenId: payload.tokenId,
        success: false,
        output: {},
        error: {
          type: 'step_failure',
          stepRef: error.stepRef,
          message: error.message,
          retryable: true,
        },
        metrics: {
          durationMs: metrics.durationMs,
          stepsExecuted: metrics.stepsExecuted,
        },
      };
    }

    if (error instanceof StepFailureError) {
      logger.error({
        eventType: 'task_step_failure',
        message: `Task failed at step: ${error.stepRef}`,
        traceId: payload.workflowRunId,
        metadata: {
          tokenId: payload.tokenId,
          stepRef: error.stepRef,
          error: error.message,
          retryable: error.retryable,
        },
      });

      return {
        tokenId: payload.tokenId,
        success: false,
        output: {},
        error: {
          type: 'step_failure',
          stepRef: error.stepRef,
          message: error.message,
          retryable: error.retryable,
        },
        metrics: {
          durationMs: metrics.durationMs,
          stepsExecuted: metrics.stepsExecuted,
        },
      };
    }

    // Unexpected error
    logger.error({
      eventType: 'task_unexpected_error',
      message: 'Task failed with unexpected error',
      traceId: payload.workflowRunId,
      metadata: {
        tokenId: payload.tokenId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return {
      tokenId: payload.tokenId,
      success: false,
      output: {},
      error: {
        type: 'step_failure',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
      metrics: {
        durationMs: metrics.durationMs,
        stepsExecuted: metrics.stepsExecuted,
      },
    };
  }
}
