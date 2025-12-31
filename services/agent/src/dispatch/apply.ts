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
    // Async Operation Tracking
    // ========================================================================

    case 'TRACK_ASYNC_OP': {
      ctx.asyncOps.track({
        turnId: decision.turnId,
        targetType: decision.targetType,
        targetId: decision.operationId,
      });
      return {};
    }

    case 'ASYNC_OP_COMPLETED': {
      if (decision.result.success) {
        ctx.asyncOps.complete(decision.operationId, decision.result.result);
      } else {
        ctx.asyncOps.fail(decision.operationId, decision.result.error);
      }
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
 * TODO: Implement RPC to Executor via Coordinator
 */
function dispatchTask(
  decision: Extract<AgentDecision, { type: 'DISPATCH_TASK' }>,
  ctx: DispatchContext,
): void {
  ctx.emitter.emitTrace({
    type: 'dispatch.task.queued',
    payload: {
      turnId: decision.turnId,
      toolCallId: decision.toolCallId,
      taskId: decision.taskId,
    },
  });

  // TODO: ctx.waitUntil(coordinator.dispatchTask(...))
}

/**
 * Dispatch a workflow execution.
 * TODO: Implement RPC to Coordinator
 */
function dispatchWorkflow(
  decision: Extract<AgentDecision, { type: 'DISPATCH_WORKFLOW' }>,
  ctx: DispatchContext,
): void {
  ctx.emitter.emitTrace({
    type: 'dispatch.workflow.queued',
    payload: {
      turnId: decision.turnId,
      toolCallId: decision.toolCallId,
      workflowId: decision.workflowId,
      async: decision.async,
    },
  });

  // TODO: ctx.waitUntil(coordinator.runWorkflow(...))
}

/**
 * Dispatch to another agent.
 * TODO: Implement RPC to Agent service
 */
function dispatchAgent(
  decision: Extract<AgentDecision, { type: 'DISPATCH_AGENT' }>,
  ctx: DispatchContext,
): void {
  ctx.emitter.emitTrace({
    type: 'dispatch.agent.queued',
    payload: {
      turnId: decision.turnId,
      toolCallId: decision.toolCallId,
      agentId: decision.agentId,
      mode: decision.mode,
      async: decision.async,
    },
  });

  // TODO: ctx.waitUntil(agent.invoke(...))
}

/**
 * Dispatch context assembly workflow.
 * TODO: Implement RPC to Coordinator
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

  // TODO: ctx.waitUntil(coordinator.runWorkflow(...))
}

/**
 * Dispatch memory extraction workflow.
 * TODO: Implement RPC to Coordinator
 */
function dispatchMemoryExtraction(
  decision: Extract<AgentDecision, { type: 'DISPATCH_MEMORY_EXTRACTION' }>,
  ctx: DispatchContext,
): void {
  ctx.emitter.emitTrace({
    type: 'dispatch.memory_extraction.queued',
    payload: {
      turnId: decision.turnId,
      workflowId: decision.workflowId,
    },
  });

  // TODO: ctx.waitUntil(coordinator.runWorkflow(...))
}
