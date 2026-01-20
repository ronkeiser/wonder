/**
 * Decision Application
 *
 * Applies AgentDecision[] by routing each decision to the appropriate
 * operations manager method or external service call.
 *
 * This is the bridge between planning (pure) and execution (effectful).
 */

import type { AgentDecision } from '../types';
import type { DispatchContext } from './context';

// ============================================================================
// Timeout Defaults (milliseconds)
// ============================================================================

/** Default timeout for tool dispatch (tasks, workflows, agents) */
const DEFAULT_TOOL_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Result of applying decisions.
 */
export type ApplyResult = {
  /** Number of decisions successfully applied */
  applied: number;
  /** IDs of turns created */
  turnsCreated: string[];
  /** Errors encountered (fail-soft: doesn't stop subsequent decisions) */
  errors: Array<{ decision: AgentDecision; error: Error }>;
};

/**
 * Outcome of applying a single decision.
 */
type ApplyOutcome = {
  turnId?: string;
};

/**
 * Apply a list of decisions.
 *
 * Iterates through decisions sequentially, applying each one.
 * Errors are collected but don't stop subsequent decisions (fail-soft).
 */
export function applyDecisions(decisions: AgentDecision[], ctx: DispatchContext): ApplyResult {
  const result: ApplyResult = {
    applied: 0,
    turnsCreated: [],
    errors: [],
  };

  for (const decision of decisions) {
    try {
      const outcome = applyOne(decision, ctx);
      result.applied++;
      if (outcome.turnId) {
        result.turnsCreated.push(outcome.turnId);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      result.errors.push({ decision, error });
    }
  }

  return result;
}

/**
 * Apply a single decision.
 *
 * Exhaustive switch on decision.type routes to the appropriate effect.
 */
function applyOne(decision: AgentDecision, ctx: DispatchContext): ApplyOutcome {
  switch (decision.type) {
    // ========================================================================
    // Turn Lifecycle
    // ========================================================================

    case 'START_TURN': {
      const turnId = ctx.turns.create({
        conversationId: decision.conversationId,
        caller: decision.caller,
        input: decision.input,
      });

      return { turnId };
    }

    case 'COMPLETE_TURN': {
      ctx.turns.complete(decision.turnId, decision.issues);
      return {};
    }

    case 'FAIL_TURN': {
      ctx.turns.fail(decision.turnId, decision.error.code, decision.error.message);
      return {};
    }

    // ========================================================================
    // Messages
    // ========================================================================

    case 'APPEND_MESSAGE': {
      ctx.messages.append({
        conversationId: ctx.conversationId,
        turnId: decision.turnId,
        role: decision.role,
        content: decision.content,
      });
      return {};
    }

    // ========================================================================
    // Move Recording
    // ========================================================================

    case 'RECORD_MOVE': {
      ctx.moves.record({
        turnId: decision.turnId,
        reasoning: decision.reasoning,
        rawContent: decision.rawContent,
      });
      return {};
    }

    // ========================================================================
    // Async Operation Tracking
    // ========================================================================

    case 'ASYNC_OP_COMPLETED': {
      if (decision.result.success) {
        ctx.asyncOps.complete(decision.operationId, decision.result.result);
      } else {
        ctx.asyncOps.fail(decision.operationId, decision.result.error);
      }
      return {};
    }

    // ========================================================================
    // Sync Tool Waiting
    // ========================================================================

    case 'MARK_WAITING': {
      ctx.asyncOps.markWaiting(decision.turnId, decision.operationId);
      return {};
    }

    case 'RESUME_FROM_TOOL': {
      ctx.asyncOps.resume(decision.operationId, decision.result);
      return {};
    }

    // ========================================================================
    // External Dispatch (RPC)
    // ========================================================================

    case 'DISPATCH_TASK': {
      dispatchTask(decision, ctx);
      return {};
    }

    case 'DISPATCH_WORKFLOW': {
      dispatchWorkflow(decision, ctx);
      return {};
    }

    case 'DISPATCH_AGENT': {
      dispatchAgent(decision, ctx);
      return {};
    }

    case 'DISPATCH_CONTEXT_ASSEMBLY': {
      dispatchContextAssembly(decision, ctx);
      return {};
    }

    case 'DISPATCH_MEMORY_EXTRACTION': {
      dispatchMemoryExtraction(decision, ctx);
      return {};
    }

    // ========================================================================
    // Exhaustive Check
    // ========================================================================

    default: {
      const _exhaustive: never = decision;
      throw new Error(`Unknown decision type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ============================================================================
// External Dispatch Functions
// ============================================================================

/**
 * Dispatch a task execution.
 *
 * Records the move for the tool call, then dispatches via Executor.
 * Executor will call back to handleTaskResult when complete.
 */
function dispatchTask(
  decision: Extract<AgentDecision, { type: 'DISPATCH_TASK' }>,
  ctx: DispatchContext,
): void {
  const { turnId, toolCallId, taskId, input, rawContent, retry } = decision;

  // Record move for this tool call
  ctx.moves.record({
    turnId,
    toolCall: {
      id: toolCallId,
      toolId: taskId,
      input: input as Record<string, unknown>,
    },
    rawContent,
  });

  // Emit dispatch event first (we're dispatching work)
  ctx.emitter.emitTrace({
    type: 'dispatch.task.queued',
    payload: { turnId, toolCallId, taskId },
  });

  // Then track the async operation (we're recording that we dispatched it)
  const timeoutAt = Date.now() + DEFAULT_TOOL_TIMEOUT_MS;
  ctx.asyncOps.track({
    opId: toolCallId,
    turnId,
    targetType: 'task',
    targetId: taskId,
    timeoutAt,
    retry,
  });

  // Schedule alarm for timeout
  ctx.waitUntil(ctx.scheduleAlarm(timeoutAt));

  // Dispatch via Executor (fire-and-forget)
  // Executor calls back via agent.handleTaskResult()
  // Include branchContext for shell operations
  ctx.waitUntil(
    ctx.executor
      .executeTaskForAgent({
        toolCallId,
        conversationId: ctx.conversationId,
        turnId,
        taskId,
        input: input as Record<string, unknown>,
        branchContext: ctx.branchContext,
      })
      .catch((error: Error) => {
        ctx.emitter.emitTrace({
          type: 'dispatch.task.error',
          payload: { turnId, toolCallId, taskId, error: error.message },
        });
      }),
  );
}

/**
 * Dispatch a workflow execution.
 *
 * Creates a workflow run in D1, then starts the coordinator DO.
 * Coordinator calls back via agent.handleWorkflowResult/Error().
 */
async function dispatchWorkflow(
  decision: Extract<AgentDecision, { type: 'DISPATCH_WORKFLOW' }>,
  ctx: DispatchContext,
): Promise<void> {
  const { turnId, toolCallId, workflowId, input, async: isAsync, rawContent, retry } = decision;

  // Record move for this tool call
  ctx.moves.record({
    turnId,
    toolCall: {
      id: toolCallId,
      toolId: workflowId,
      input: input as Record<string, unknown>,
    },
    rawContent,
  });

  // Emit dispatch event first (we're dispatching work)
  ctx.emitter.emitTrace({
    type: 'dispatch.workflow.queued',
    payload: { turnId, toolCallId, workflowId, async: isAsync },
  });

  // Then track the async operation (we're recording that we dispatched it)
  const timeoutAt = Date.now() + DEFAULT_TOOL_TIMEOUT_MS;
  ctx.asyncOps.track({
    opId: toolCallId,
    turnId,
    targetType: 'workflow',
    targetId: workflowId,
    timeoutAt,
    retry,
  });

  // Schedule alarm for timeout
  ctx.waitUntil(ctx.scheduleAlarm(timeoutAt));

  // Create workflow run in D1
  const workflowRunsResource = ctx.resources.workflowRuns();
  const { workflowRunId } = await workflowRunsResource.create(workflowId, {
    ...(input as Record<string, unknown>),
    // Include callback routing info
    _callback: {
      conversationId: ctx.conversationId,
      turnId,
      toolCallId,
      type: 'workflow',
    },
  });

  // Start coordinator DO
  const coordinatorId = ctx.coordinator.idFromName(workflowRunId);
  const coordinator = ctx.coordinator.get(coordinatorId);

  ctx.waitUntil(
    coordinator.start(workflowRunId).catch((error: Error) => {
      ctx.emitter.emitTrace({
        type: 'dispatch.workflow.error',
        payload: { turnId, toolCallId, workflowId, workflowRunId, error: error.message },
      });
    }),
  );
}

/**
 * Dispatch to another agent.
 *
 * Gets the target agent's DO and starts a turn.
 * Target agent calls back via agent.handleAgentResponse().
 */
function dispatchAgent(
  decision: Extract<AgentDecision, { type: 'DISPATCH_AGENT' }>,
  ctx: DispatchContext,
): void {
  const { turnId, toolCallId, agentId, input, mode, async: isAsync, rawContent, retry } = decision;

  // Record move for this tool call
  ctx.moves.record({
    turnId,
    toolCall: {
      id: toolCallId,
      toolId: agentId,
      input: input as Record<string, unknown>,
    },
    rawContent,
  });

  // Emit dispatch event first (we're dispatching work)
  ctx.emitter.emitTrace({
    type: 'dispatch.agent.queued',
    payload: { turnId, toolCallId, agentId, mode, async: isAsync },
  });

  // Then track the async operation (we're recording that we dispatched it)
  const timeoutAt = Date.now() + DEFAULT_TOOL_TIMEOUT_MS;
  ctx.asyncOps.track({
    opId: toolCallId,
    turnId,
    targetType: 'agent',
    targetId: agentId,
    timeoutAt,
    retry,
  });

  // Schedule alarm for timeout
  ctx.waitUntil(ctx.scheduleAlarm(timeoutAt));

  if (mode === 'loop_in') {
    // Loop-in mode: agent joins THIS conversation
    // 1. Add agent as participant
    ctx.participants.add({
      conversationId: ctx.conversationId,
      participant: { type: 'agent', agentId },
      addedByTurnId: turnId,
    });

    // 2. Use the SAME conversation ID - agent joins our conversation
    const targetAgentId = ctx.agent.idFromName(ctx.conversationId);
    const targetAgent = ctx.agent.get(targetAgentId);

    // 3. No callback needed - responses are visible to all participants
    // The input goes directly to the agent without callback metadata
    ctx.waitUntil(
      targetAgent
        .startTurn(ctx.conversationId, input, {
          type: 'agent',
          agentId: ctx.conversationId,
          turnId,
        })
        .catch((error: Error) => {
          ctx.emitter.emitTrace({
            type: 'dispatch.agent.error',
            payload: { turnId, toolCallId, agentId, mode: 'loop_in', error: error.message },
          });
        }),
    );
  } else {
    // Delegate mode: agent works in a separate conversation
    // Must create conversation record in D1 before calling startTurn

    // Embed callback metadata so target agent can report back
    const targetInput = {
      ...(input as Record<string, unknown>),
      _agentCallback: {
        conversationId: ctx.conversationId,
        turnId,
        toolCallId,
      },
    };

    ctx.waitUntil(
      (async () => {
        try {
          // 1. Create conversation in D1 with target agent as participant
          const conversationsResource = ctx.resources.conversations();
          const { conversationId: targetConversationId } = await conversationsResource.create({
            participants: [{ type: 'agent', agentId }],
            status: 'active',
          });

          // 2. Get target agent's DO using the new conversation ID
          const targetAgentId = ctx.agent.idFromName(targetConversationId);
          const targetAgent = ctx.agent.get(targetAgentId);

          // 3. Start turn on the delegated conversation
          await targetAgent.startTurn(targetConversationId, targetInput, {
            type: 'agent',
            agentId: ctx.conversationId, // The calling agent's conversation ID
            turnId,
          });
        } catch (error) {
          ctx.emitter.emitTrace({
            type: 'dispatch.agent.error',
            payload: {
              turnId,
              toolCallId,
              agentId,
              mode: 'delegate',
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      })(),
    );
  }
}

/**
 * Dispatch context assembly workflow.
 *
 * This is handled by the loop module directly, not through decisions.
 * This handler exists for completeness but should not normally be called.
 */
function dispatchContextAssembly(
  decision: Extract<AgentDecision, { type: 'DISPATCH_CONTEXT_ASSEMBLY' }>,
  ctx: DispatchContext,
): void {
  ctx.emitter.emitTrace({
    type: 'dispatch.context_assembly.queued',
    payload: {
      turnId: decision.turnId,
      workflowId: decision.workflowId,
    },
  });

  // Context assembly is handled by loop.dispatchContextAssembly()
  // This is here for decision type completeness
}

/**
 * Dispatch memory extraction workflow.
 *
 * Creates a workflow run in D1, then starts the coordinator DO.
 * Memory extraction runs async and doesn't block turn completion.
 */
async function dispatchMemoryExtraction(
  decision: Extract<AgentDecision, { type: 'DISPATCH_MEMORY_EXTRACTION' }>,
  ctx: DispatchContext,
): Promise<void> {
  const { turnId, workflowId, input } = decision;

  ctx.emitter.emitTrace({
    type: 'dispatch.memory_extraction.queued',
    payload: { turnId, workflowId },
  });

  // Create workflow run in D1
  const workflowRunsResource = ctx.resources.workflowRuns();
  const { workflowRunId } = await workflowRunsResource.create(workflowId, {
    ...input,
    // Include callback routing info
    _callback: {
      conversationId: ctx.conversationId,
      turnId,
      type: 'memory_extraction',
    },
  });

  // Link to turn
  ctx.turns.linkMemoryExtraction(turnId, workflowRunId);

  // Start coordinator DO
  const coordinatorId = ctx.coordinator.idFromName(workflowRunId);
  const coordinator = ctx.coordinator.get(coordinatorId);

  ctx.waitUntil(
    coordinator.start(workflowRunId).catch((error: Error) => {
      ctx.emitter.emitTrace({
        type: 'dispatch.memory_extraction.error',
        payload: { turnId, workflowId, workflowRunId, error: error.message },
      });
    }),
  );
}
