/**
 * Agent Loop
 *
 * Core orchestration logic for the agent conversation loop.
 *
 * The loop follows the pattern:
 * 1. Dispatch context assembly workflow
 * 2. On callback: run LLM with assembled context
 * 3. Interpret response → dispatch decisions
 * 4. If sync tools: wait for callback, continue loop
 * 5. If async tools: respond immediately, turn stays active
 * 6. On all ops complete: dispatch memory extraction, complete turn
 */

import { ulid } from 'ulid';

import { applyDecisions } from './dispatch/apply';
import type { DispatchContext } from './dispatch/context';
import { callLLM, callLLMWithStreaming } from './llm';
import type { DefinitionManager, ToolDefRow } from './operations/defs';
import type { MoveRow } from './operations/moves';
import { interpretResponse, resolveTools, type Tool } from './planning';
import type {
  ActiveTurnInfo,
  ContextAssemblyInput,
  LLMRequest,
  MoveSnapshot,
  PendingOperationInfo,
  TurnSnapshot,
} from './types';

// ============================================================================
// Types
// ============================================================================

export type RunLLMLoopParams = {
  turnId: string;
  llmRequest: LLMRequest;
  defs: DefinitionManager;
  ctx: DispatchContext;
};

export type RunLLMLoopResult = {
  /** True if waiting on sync tool result */
  waitingForSync: boolean;
  /** Count of async operations still pending */
  pendingAsyncOps: number;
};

// ============================================================================
// Context Assembly Dispatch
// ============================================================================

/**
 * Dispatch context assembly workflow.
 *
 * Called at the start of a turn. The workflow assembles context from
 * memory, artifacts, and conversation history, then returns a
 * provider-native LLM request.
 *
 * The turn waits for handleContextAssemblyResult callback.
 *
 * TODO: Context assembly needs a callback mechanism from coordinator to agent.
 * For now, this is a placeholder that will need coordinator changes to support
 * agent-specific callback routing.
 */
export async function dispatchContextAssembly(
  turnId: string,
  userMessage: string,
  defs: DefinitionManager,
  ctx: DispatchContext,
): Promise<void> {
  const persona = defs.getPersona();
  if (!persona) {
    throw new Error('No persona configured for this agent');
  }

  // Get recent turns for context
  const recentTurnRows = ctx.turns.getRecent(ctx.conversationId, persona.recentTurnsLimit);
  const recentTurns = recentTurnRows.map((turn) => toTurnSnapshot(turn, ctx));

  // Get active turns with pending operations (excluding current turn)
  const activeTurnRows = ctx.turns.getActive(ctx.conversationId);
  const activeTurns: ActiveTurnInfo[] = activeTurnRows
    .filter((t) => t.id !== turnId) // Exclude current turn
    .map((turn) => {
      const pendingOps = ctx.asyncOps.getPending(turn.id);
      return {
        turnId: turn.id,
        startedAt: turn.createdAt.toISOString(),
        pendingOperations: pendingOps.map((op): PendingOperationInfo => ({
          type: op.targetType,
          targetId: op.targetId,
          startedAt: op.createdAt.toISOString(),
        })),
      };
    });

  // Build context assembly input
  const input: ContextAssemblyInput = {
    conversationId: ctx.conversationId,
    userMessage,
    recentTurns,
    modelProfileId: persona.modelProfileId,
    toolIds: persona.toolIds,
    activeTurns: activeTurns.length > 0 ? activeTurns : undefined,
  };

  // Create workflow run in D1
  const workflowRunsResource = ctx.resources.workflowRuns();
  const { workflowRunId } = await workflowRunsResource.create(
    persona.contextAssemblyWorkflowId,
    {
      ...input,
      // Include callback routing info in input for coordinator to use
      _callback: {
        conversationId: ctx.conversationId,
        turnId,
        type: 'context_assembly',
      },
    },
  );

  // Start the coordinator DO
  const coordinatorId = ctx.coordinator.idFromName(workflowRunId);
  const coordinator = ctx.coordinator.get(coordinatorId);

  ctx.waitUntil(
    coordinator.start(workflowRunId).catch((error: Error) => {
      ctx.emitter.emitTrace({
        type: 'loop.context_assembly.dispatch_error',
        payload: {
          turnId,
          workflowId: persona.contextAssemblyWorkflowId,
          workflowRunId,
          error: error.message,
        },
      });
    }),
  );

  // Link workflow run to turn
  ctx.turns.linkContextAssembly(turnId, workflowRunId);

  ctx.emitter.emitTrace({
    type: 'loop.context_assembly.dispatched',
    payload: {
      turnId,
      workflowRunId,
      workflowId: persona.contextAssemblyWorkflowId,
      recentTurnsCount: recentTurns.length,
      activeTurnsCount: activeTurns.length,
    },
  });
}

// ============================================================================
// LLM Loop
// ============================================================================

/**
 * Run the LLM loop.
 *
 * Called after context assembly completes. This:
 * 1. Resolves tools from persona
 * 2. Calls LLM with context and tools
 * 3. Interprets response → decisions
 * 4. Applies decisions (messages, tool dispatch)
 *
 * Returns loop state indicating whether we're waiting for sync tools.
 */
export async function runLLMLoop(params: RunLLMLoopParams): Promise<RunLLMLoopResult> {
  const { turnId, llmRequest, defs, ctx } = params;

  // Resolve tools for LLM
  const toolDefs = defs.getTools();
  const tools = toolDefs.map(toTool);
  const { specs, lookup } = resolveTools(tools);

  ctx.emitter.emitTrace({
    type: 'loop.llm.calling',
    payload: {
      turnId,
      messageCount: llmRequest.messages.length,
      toolCount: specs.length,
    },
  });

  // Call LLM (use streaming if WebSocket connected)
  const response = ctx.streamToken
    ? await callLLMWithStreaming(llmRequest, specs, ctx.env.ANTHROPIC_API_KEY, ctx.streamToken)
    : await callLLM(llmRequest, specs, ctx.env.ANTHROPIC_API_KEY);

  ctx.emitter.emitTrace({
    type: 'loop.llm.response',
    payload: {
      turnId,
      hasText: !!response.text,
      toolCallCount: response.toolUse?.length ?? 0,
      stopReason: response.stopReason,
    },
  });

  // Interpret response → decisions
  const { decisions, events } = interpretResponse({
    turnId,
    response,
    toolLookup: lookup,
  });

  // Emit planning events
  for (const event of events) {
    ctx.emitter.emitTrace(event);
  }

  // Apply decisions
  const applyResult = applyDecisions(decisions, ctx);

  if (applyResult.errors.length > 0) {
    ctx.emitter.emitTrace({
      type: 'loop.apply.errors',
      payload: {
        turnId,
        errorCount: applyResult.errors.length,
        errors: applyResult.errors.map((e) => ({
          type: e.decision.type,
          message: e.error.message,
        })),
      },
    });
  }

  // Check for sync tools
  const hasSyncTools = decisions.some(
    (d) =>
      d.type === 'DISPATCH_TASK' || (d.type === 'DISPATCH_WORKFLOW' && !d.async),
  );

  if (hasSyncTools) {
    // Mark waiting for sync tools
    for (const d of decisions) {
      if (d.type === 'DISPATCH_TASK') {
        ctx.asyncOps.markWaiting(turnId, d.toolCallId);
      } else if (d.type === 'DISPATCH_WORKFLOW' && !d.async) {
        ctx.asyncOps.markWaiting(turnId, d.toolCallId);
      }
    }

    ctx.emitter.emitTrace({
      type: 'loop.waiting_for_sync',
      payload: { turnId },
    });

    return {
      waitingForSync: true,
      pendingAsyncOps: ctx.asyncOps.getPendingCount(turnId),
    };
  }

  // No sync tools - return current state
  return {
    waitingForSync: false,
    pendingAsyncOps: ctx.asyncOps.getPendingCount(turnId),
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert ToolDefRow to Tool for planning layer.
 */
function toTool(def: ToolDefRow): Tool {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema as Record<string, unknown>,
    targetType: def.targetType,
    targetId: def.targetId,
    async: def.async,
    invocationMode: def.invocationMode ?? undefined,
    inputMapping: def.inputMapping ?? undefined,
  };
}

/**
 * Convert turn row to snapshot for context assembly.
 */
function toTurnSnapshot(
  turn: { id: string; input: unknown; completedAt: Date | null },
  ctx: DispatchContext,
): TurnSnapshot {
  const moves = ctx.moves.getForTurn(turn.id);
  return {
    id: turn.id,
    input: turn.input,
    moves: moves.map(toMoveSnapshot),
    completedAt: turn.completedAt?.toISOString() ?? null,
  };
}

/**
 * Convert move row to snapshot for context assembly.
 */
function toMoveSnapshot(move: MoveRow): MoveSnapshot {
  return {
    sequence: move.sequence,
    reasoning: move.reasoning ?? undefined,
    toolCall: move.toolId
      ? {
          toolId: move.toolId,
          input: (move.toolInput as Record<string, unknown>) ?? {},
        }
      : undefined,
    toolResult: (move.toolResult as Record<string, unknown>) ?? undefined,
  };
}
