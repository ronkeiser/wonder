/**
 * Action Dispatcher
 *
 * Routes action execution to the appropriate handler based on action.kind.
 *
 * @see docs/architecture/executor.md
 */

import type { Logger } from '@wonder/logs';
import type { Action } from '@wonder/resources/types';
import { executeLLMAction } from './llm';
import { executeMockAction } from './mock';
import type { ActionDeps, ActionInput, ActionOutput } from './types';

export interface DispatchActionParams {
  action: Action;
  input: Record<string, unknown>;
  context: {
    workflowRunId: string;
    tokenId: string;
    stepRef: string;
  };
}

/**
 * Dispatch an action to the appropriate handler
 */
export async function dispatchAction(
  params: DispatchActionParams,
  deps: ActionDeps,
): Promise<ActionOutput> {
  const { action, input, context } = params;
  const { logger } = deps;

  const actionInput: ActionInput = {
    action,
    input,
    context,
  };

  logger.info({
    event_type: 'action_dispatch_started',
    message: `Dispatching action: ${action.kind}`,
    trace_id: context.workflowRunId,
    metadata: {
      step_ref: context.stepRef,
      action_id: action.id,
      action_kind: action.kind,
      input_keys: Object.keys(input),
    },
  });

  switch (action.kind) {
    case 'llm_call':
      return executeLLMAction(actionInput, deps);

    case 'http_request':
      // TODO: Implement HTTP action handler
      return notImplemented(action, context, logger);

    case 'mcp_tool':
      // TODO: Implement MCP tool action handler
      return notImplemented(action, context, logger);

    case 'human_input':
      // TODO: Implement human input action handler
      return notImplemented(action, context, logger);

    case 'update_context':
      // TODO: Implement expression evaluation per primitives.md
      // Currently a pass-through stub. Should evaluate implementation.updates[].expr
      // against input to enable computation (math, string ops, conditionals).
      // Output mapping alone cannot compute derived values (e.g., average of scores).
      return {
        success: true,
        output: input,
        metrics: { duration_ms: 0 },
      };

    case 'write_artifact':
      // TODO: Implement artifact writing action handler
      return notImplemented(action, context, logger);

    case 'workflow_call':
      // TODO: Implement sub-workflow action handler
      return notImplemented(action, context, logger);

    case 'vector_search':
      // TODO: Implement vector search action handler
      return notImplemented(action, context, logger);

    case 'emit_metric':
      // TODO: Implement metric emission action handler
      return notImplemented(action, context, logger);

    case 'mock':
      return executeMockAction(actionInput, deps);

    default: {
      const _exhaustive: never = action.kind;
      logger.error({
        event_type: 'action_unknown_kind',
        message: `Unknown action kind: ${action.kind}`,
        trace_id: context.workflowRunId,
        metadata: { step_ref: context.stepRef, action_id: action.id },
      });
      return {
        success: false,
        output: {},
        error: {
          message: `Unknown action kind: ${action.kind}`,
          retryable: false,
        },
      };
    }
  }
}

/**
 * Helper for not-yet-implemented action handlers
 */
function notImplemented(
  action: Action,
  context: { workflowRunId: string; stepRef: string },
  logger: Logger,
): ActionOutput {
  logger.warn({
    event_type: 'action_not_implemented',
    message: `Action kind not yet implemented: ${action.kind}`,
    trace_id: context.workflowRunId,
    metadata: {
      step_ref: context.stepRef,
      action_id: action.id,
      action_kind: action.kind,
    },
  });

  return {
    success: false,
    output: {},
    error: {
      message: `Action kind not yet implemented: ${action.kind}`,
      code: 'NOT_IMPLEMENTED',
      retryable: false,
    },
  };
}
