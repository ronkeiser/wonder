/**
 * Step Executor - Execute individual steps within a task
 *
 * @see docs/architecture/executor.md
 */

import type { Emitter } from '@wonder/events';
import type { Logger } from '@wonder/logs';
import type { Step } from '@wonder/resources/types';
import { dispatchAction } from '../actions';
import { applyInputMapping, applyOutputMapping } from '../context/mapping';
import { evaluateCondition } from './condition-evaluator';
import type { ActionResult, StepResult, TaskContext } from './types';
import { StepFailureError, TaskRetryError } from './types';

export interface StepExecutorDeps {
  logger: Logger;
  emitter: Emitter;
  env: Env;
  workflowRunId: string;
  tokenId: string;
}

/**
 * Execute a single step
 */
export async function executeStep(
  step: Step,
  context: TaskContext,
  deps: StepExecutorDeps,
): Promise<StepResult> {
  const { logger, emitter, workflowRunId, tokenId } = deps;
  const stepStartTime = Date.now();

  // Emit step started trace event
  emitter.emitTrace({
    type: 'executor.step.started',
    tokenId: tokenId,
    payload: {
      stepRef: step.ref,
      stepOrdinal: step.ordinal,
      actionId: step.actionId,
      actionVersion: step.actionVersion,
      hasCondition: !!step.condition,
    },
  });

  // 1. Evaluate condition (if present)
  if (step.condition) {
    const conditionResult = evaluateCondition(step.condition, context);

    if (!conditionResult.passed) {
      // Determine outcome based on condition.else
      const outcome = conditionResult.outcome;

      logger.info({
        eventType: 'step_condition_evaluated',
        message: `Step condition evaluated to ${outcome}`,
        traceId: workflowRunId,
        metadata: {
          stepRef: step.ref,
          condition: step.condition.if,
          outcome,
        },
      });

      switch (outcome) {
        case 'skip':
          return { success: true, skipped: true, skipReason: 'condition_false' };
        case 'succeed':
          return { success: true, skipped: true, skipReason: 'condition_skip' };
        case 'fail':
          throw new StepFailureError(step.ref, 'Condition evaluated to fail');
        case 'continue':
        default:
          // Continue means proceed to execute the step
          break;
      }
    }
  }

  // 2. Apply input mapping: context → action input
  const actionInput = applyInputMapping(
    step.inputMapping as Record<string, unknown> | null,
    context,
  );

  logger.info({
    eventType: 'step_input_mapped',
    traceId: workflowRunId,
    metadata: {
      stepRef: step.ref,
      inputKeys: Object.keys(actionInput),
    },
  });

  // 3. Execute action
  let actionResult: ActionResult;
  try {
    actionResult = await executeAction(step, actionInput, deps);
  } catch (error) {
    // Handle step failure based on onFailure policy
    return handleStepFailure(step, error, context, deps);
  }

  if (!actionResult.success) {
    return handleStepFailure(
      step,
      new Error(actionResult.error?.message || 'Action failed'),
      context,
      deps,
    );
  }

  // 4. Apply output mapping: action output → context
  applyOutputMapping(
    step.outputMapping as Record<string, unknown> | null,
    actionResult.output,
    context,
    logger,
  );

  // Preserve _subworkflow signal for coordinator
  // Workflow actions return this metadata to trigger parent token waiting
  if (actionResult.output._subworkflow) {
    context.output._subworkflow = actionResult.output._subworkflow;
  }

  // Emit step completed trace event
  const stepDuration = Date.now() - stepStartTime;
  emitter.emitTrace({
    type: 'executor.step.completed',
    tokenId: tokenId,
    durationMs: stepDuration,
    payload: {
      stepRef: step.ref,
      actionId: step.actionId,
      success: true,
      outputKeys: Object.keys(actionResult.output),
    },
  });

  logger.info({
    eventType: 'step_output_mapped',
    traceId: workflowRunId,
    metadata: {
      stepRef: step.ref,
      outputKeys: Object.keys(actionResult.output),
    },
  });

  return {
    success: true,
    output: actionResult.output,
  };
}

/**
 * Execute an action - loads ActionDef and dispatches to handler
 */
async function executeAction(
  step: Step,
  input: Record<string, unknown>,
  deps: StepExecutorDeps,
): Promise<ActionResult> {
  const { logger, emitter, env, workflowRunId, tokenId } = deps;
  const actionStartTime = Date.now();

  // Load ActionDef from Resources
  using actionsResource = env.RESOURCES.actions();
  const { action } = await actionsResource.get(step.actionId, step.actionVersion);

  // Emit action started trace event
  emitter.emitTrace({
    type: 'executor.action.started',
    tokenId: tokenId,
    payload: {
      stepRef: step.ref,
      actionId: action.id,
      actionKind: action.kind,
      actionVersion: action.version,
      inputKeys: Object.keys(input),
    },
  });

  logger.info({
    eventType: 'action_execution_started',
    traceId: workflowRunId,
    metadata: {
      stepRef: step.ref,
      actionId: action.id,
      actionKind: action.kind,
      actionVersion: action.version,
      inputKeys: Object.keys(input),
    },
  });

  // Dispatch to appropriate action handler (pass emitter for mock action tracing)
  const result = await dispatchAction(
    {
      action,
      input,
      context: {
        workflowRunId,
        tokenId,
        stepRef: step.ref,
      },
    },
    { logger, emitter, env },
  );

  if (!result.success) {
    // Emit action failed trace event
    emitter.emitTrace({
      type: 'executor.action.failed',
      tokenId: tokenId,
      payload: {
        stepRef: step.ref,
        actionId: action.id,
        actionKind: action.kind,
        error: result.error?.message,
        errorCode: result.error?.code,
        retryable: result.error?.retryable,
      },
    });

    logger.warn({
      eventType: 'action_execution_failed',
      traceId: workflowRunId,
      metadata: {
        stepRef: step.ref,
        actionId: action.id,
        error: result.error,
      },
    });
  } else {
    // Emit action completed trace event
    emitter.emitTrace({
      type: 'executor.action.completed',
      tokenId: tokenId,
      durationMs: result.metrics?.durationMs,
      payload: {
        stepRef: step.ref,
        actionId: action.id,
        actionKind: action.kind,
        outputKeys: Object.keys(result.output),
      },
    });

    logger.info({
      eventType: 'action_execution_completed',
      traceId: workflowRunId,
      metadata: {
        stepRef: step.ref,
        actionId: action.id,
        outputKeys: Object.keys(result.output),
        durationMs: result.metrics?.durationMs,
      },
    });
  }

  return {
    success: result.success,
    output: result.output,
    error: result.error,
    metrics: result.metrics,
  };
}

/**
 * Handle step failure based on onFailure policy
 */
function handleStepFailure(
  step: Step,
  error: unknown,
  context: TaskContext,
  deps: StepExecutorDeps,
): StepResult {
  const { logger, workflowRunId } = deps;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const onFailure = step.onFailure || 'abort';

  logger.warn({
    eventType: 'step_failure',
    message: `Step failed with policy: ${onFailure}`,
    traceId: workflowRunId,
    metadata: {
      stepRef: step.ref,
      onFailure: onFailure,
      error: errorMessage,
    },
  });

  switch (onFailure) {
    case 'abort':
      throw new StepFailureError(step.ref, errorMessage, false);

    case 'retry':
      throw new TaskRetryError(step.ref, errorMessage);

    case 'continue':
      // Store error in context and continue
      if (!context.state._errors) {
        context.state._errors = [];
      }
      (context.state._errors as Array<{ step: string; error: string }>).push({
        step: step.ref,
        error: errorMessage,
      });
      return {
        success: false,
        error: { message: errorMessage, retryable: false },
      };

    default:
      throw new StepFailureError(step.ref, errorMessage, false);
  }
}
