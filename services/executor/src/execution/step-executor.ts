/**
 * Step Executor - Execute individual steps within a task
 *
 * @see docs/architecture/executor.md
 */

import type { Logger } from '@wonder/logs';
import type { Step } from '@wonder/resources/types';
import { dispatchAction } from '../actions';
import { applyInputMapping, applyOutputMapping } from '../context/mapping';
import { evaluateCondition } from './condition-evaluator';
import type { ActionResult, StepResult, TaskContext } from './types';
import { StepFailureError, TaskRetryError } from './types';

export interface StepExecutorDeps {
  logger: Logger;
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
  const { logger, workflowRunId } = deps;

  // 1. Evaluate condition (if present)
  if (step.condition) {
    const conditionResult = evaluateCondition(step.condition, context);

    if (!conditionResult.passed) {
      // Determine outcome based on condition.else
      const outcome = conditionResult.outcome;

      logger.info({
        event_type: 'step_condition_evaluated',
        message: `Step condition evaluated to ${outcome}`,
        trace_id: workflowRunId,
        metadata: {
          step_ref: step.ref,
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
    step.input_mapping as Record<string, unknown> | null,
    context,
  );

  logger.info({
    event_type: 'step_input_mapped',
    trace_id: workflowRunId,
    metadata: {
      step_ref: step.ref,
      input_keys: Object.keys(actionInput),
    },
  });

  // 3. Execute action
  let actionResult: ActionResult;
  try {
    actionResult = await executeAction(step, actionInput, deps);
  } catch (error) {
    // Handle step failure based on on_failure policy
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
    step.output_mapping as Record<string, unknown> | null,
    actionResult.output,
    context,
    logger,
  );

  logger.info({
    event_type: 'step_output_mapped',
    trace_id: workflowRunId,
    metadata: {
      step_ref: step.ref,
      output_keys: Object.keys(actionResult.output),
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
  const { logger, env, workflowRunId, tokenId } = deps;

  // Load ActionDef from Resources
  using actionsResource = env.RESOURCES.actions();
  const { action } = await actionsResource.get(step.action_id, step.action_version);

  logger.info({
    event_type: 'action_execution_started',
    trace_id: workflowRunId,
    metadata: {
      step_ref: step.ref,
      action_id: action.id,
      action_kind: action.kind,
      action_version: action.version,
      input_keys: Object.keys(input),
    },
  });

  // Dispatch to appropriate action handler
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
    { logger, env },
  );

  if (!result.success) {
    logger.warn({
      event_type: 'action_execution_failed',
      trace_id: workflowRunId,
      metadata: {
        step_ref: step.ref,
        action_id: action.id,
        error: result.error,
      },
    });
  } else {
    logger.info({
      event_type: 'action_execution_completed',
      trace_id: workflowRunId,
      metadata: {
        step_ref: step.ref,
        action_id: action.id,
        output_keys: Object.keys(result.output),
        duration_ms: result.metrics?.duration_ms,
      },
    });
  }

  return {
    success: result.success,
    output: result.output,
    error: result.error,
  };
}

/**
 * Handle step failure based on on_failure policy
 */
function handleStepFailure(
  step: Step,
  error: unknown,
  context: TaskContext,
  deps: StepExecutorDeps,
): StepResult {
  const { logger, workflowRunId } = deps;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const onFailure = step.on_failure || 'abort';

  logger.warn({
    event_type: 'step_failure',
    message: `Step failed with policy: ${onFailure}`,
    trace_id: workflowRunId,
    metadata: {
      step_ref: step.ref,
      on_failure: onFailure,
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
