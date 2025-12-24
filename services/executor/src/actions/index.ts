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
import { executeUpdateContextAction } from './update-context';

export interface DispatchActionParams {
  action: Action;
  input: Record<string, unknown>;
  context: {
    workflowRunId: string;
    rootRunId: string;
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
    eventType: 'action_dispatch_started',
    message: `Dispatching action: ${action.kind}`,
    traceId: context.workflowRunId,
    metadata: {
      stepRef: context.stepRef,
      actionId: action.id,
      actionKind: action.kind,
      inputKeys: Object.keys(input),
    },
  });

  switch (action.kind) {
    case 'llm':
      return executeLLMAction(actionInput, deps);

    case 'http':
      // TODO: Implement HTTP action handler
      return notImplemented(action, context, logger);

    case 'mcp':
      // TODO: Implement MCP tool action handler
      return notImplemented(action, context, logger);

    case 'human':
      // TODO: Implement human input action handler
      return notImplemented(action, context, logger);

    case 'context':
      return executeUpdateContextAction(actionInput, deps);

    case 'artifact':
      // TODO: Implement artifact writing action handler
      return notImplemented(action, context, logger);

    case 'workflow':
      // Workflow actions are deprecated - subworkflows should use node-level subworkflowId
      logger.error({
        eventType: 'action_workflow_deprecated',
        message: 'Workflow actions are deprecated. Use subworkflowId on the node instead.',
        traceId: context.workflowRunId,
        metadata: { stepRef: context.stepRef, actionId: action.id },
      });
      return {
        success: false,
        output: {},
        error: {
          message: 'Workflow actions are deprecated. Configure subworkflowId on the node instead.',
          code: 'DEPRECATED',
          retryable: false,
        },
      };

    case 'vector':
      // TODO: Implement vector search action handler
      return notImplemented(action, context, logger);

    case 'metric':
      // TODO: Implement metric emission action handler
      return notImplemented(action, context, logger);

    case 'mock':
      return executeMockAction(actionInput, deps);

    default: {
      const _exhaustive: never = action.kind;
      logger.error({
        eventType: 'action_unknown_kind',
        message: `Unknown action kind: ${action.kind}`,
        traceId: context.workflowRunId,
        metadata: { stepRef: context.stepRef, actionId: action.id },
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
    eventType: 'action_not_implemented',
    message: `Action kind not yet implemented: ${action.kind}`,
    traceId: context.workflowRunId,
    metadata: {
      stepRef: context.stepRef,
      actionId: action.id,
      actionKind: action.kind,
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
