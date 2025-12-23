/**
 * Workflow Action Handler
 *
 * Executes a sub-workflow within a parent workflow.
 * The parent token waits until the child workflow completes,
 * then resumes with the child's output.
 *
 * Implementation schema for workflow actions:
 * {
 *   workflowId: string | { fromContext: string };  // Static ID or context path
 *   version?: number;                               // Optional pinned version
 *   timeoutMs?: number;                             // Optional timeout for sub-workflow
 * }
 *
 * @see docs/architecture/executor.md
 */

import type { ActionDeps, ActionInput, ActionOutput } from './types';

/**
 * Workflow action implementation schema
 */
interface WorkflowImplementation {
  /** Static workflow ID or context path reference */
  workflowId: string | { fromContext: string };
  /** Optional version to pin the sub-workflow to */
  version?: number;
  /** Optional timeout for sub-workflow completion */
  timeoutMs?: number;
}

/**
 * Resolve the workflow ID from implementation config
 */
function resolveWorkflowId(
  impl: WorkflowImplementation,
  input: Record<string, unknown>,
): string {
  if (typeof impl.workflowId === 'string') {
    return impl.workflowId;
  }

  // Dynamic lookup from input context
  const path = impl.workflowId.fromContext;
  const value = input[path];

  if (typeof value !== 'string') {
    throw new Error(
      `Workflow ID from context path '${path}' must be a string, got ${typeof value}`,
    );
  }

  return value;
}

/**
 * Execute a sub-workflow action
 *
 * This handler:
 * 1. Creates a child workflow run
 * 2. Starts the child workflow via its coordinator
 * 3. Returns a "waiting" signal so the parent token waits for completion
 */
export async function executeWorkflowAction(
  input: ActionInput,
  deps: ActionDeps,
): Promise<ActionOutput> {
  const { action, input: actionInput, context } = input;
  const { logger, env } = deps;
  const startTime = Date.now();

  const impl = action.implementation as WorkflowImplementation;

  try {
    // 1. Resolve the workflow ID
    const workflowId = resolveWorkflowId(impl, actionInput);

    logger.info({
      eventType: 'workflow_action.starting',
      message: 'Starting sub-workflow',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        workflowId,
        parentTokenId: context.tokenId,
        timeoutMs: impl.timeoutMs,
      },
    });

    // 2. Create child workflow run via Resources service
    // Pass rootRunId so the child inherits the top-level run ID for event scoping
    using workflowRunsResource = env.RESOURCES.workflowRuns();
    const { workflowRunId: childRunId } = await workflowRunsResource.create(
      workflowId,
      actionInput,
      {
        rootRunId: context.rootRunId,
        parentRunId: context.workflowRunId,
        parentTokenId: context.tokenId,
      },
    );

    logger.info({
      eventType: 'workflow_action.child_created',
      message: 'Child workflow run created',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        childRunId,
        parentTokenId: context.tokenId,
      },
    });

    // 3. Start the child workflow via its coordinator
    const childCoordinatorId = env.COORDINATOR.idFromName(childRunId);
    const childCoordinator = env.COORDINATOR.get(childCoordinatorId);
    await childCoordinator.start(childRunId);

    const durationMs = Date.now() - startTime;

    logger.info({
      eventType: 'workflow_action.child_started',
      message: 'Child workflow started, returning subworkflow metadata',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        childRunId,
        parentTokenId: context.tokenId,
        timeoutMs: impl.timeoutMs,
      },
    });

    // Return subworkflow metadata - coordinator will detect this and mark token as waiting
    return {
      success: true,
      output: {
        _subworkflow: {
          childRunId,
          timeoutMs: impl.timeoutMs,
        },
      },
      metrics: { durationMs },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error({
      eventType: 'workflow_action.failed',
      message: 'Failed to start sub-workflow',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return {
      success: false,
      output: {},
      error: {
        message: `Failed to start sub-workflow: ${error instanceof Error ? error.message : String(error)}`,
        code: 'SUBWORKFLOW_START_FAILED',
        retryable: false,
      },
      metrics: { durationMs },
    };
  }
}
