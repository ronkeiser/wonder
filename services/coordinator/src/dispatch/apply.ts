/**
 * Decision Dispatch - Apply
 *
 * Converts Decision[] into actual operations using managers.
 * This is the "act" phase of the coordinator - executing decisions
 * produced by the planning layer.
 *
 * Key responsibilities:
 * - Route decisions to appropriate managers
 * - Handle recursive decisions (CHECK_SYNCHRONIZATION → more decisions)
 * - Emit trace events for observability
 */

import type { Emitter } from '@wonder/events';
import type { JSONSchema } from '@wonder/schemas';

import type { ContextManager } from '../operations/context';
import type { DefinitionManager } from '../operations/defs';
import type { TokenManager } from '../operations/tokens';
import type { Decision, TracedDecision } from '../types';

import { batchDecisions } from './batch';

// ============================================================================
// Types
// ============================================================================

/** Dependencies required to apply decisions */
export type DispatchContext = {
  tokens: TokenManager;
  context: ContextManager;
  defs: DefinitionManager;
  emitter: Emitter;
  workflowRunId: string;
};

/** Result of applying decisions */
export type ApplyResult = {
  applied: number;
  tokensCreated: string[];
  tokensDispatched: string[];
  errors: Array<{ decision: Decision; error: Error }>;
};

// ============================================================================
// Main Dispatch Entry Point
// ============================================================================

/**
 * Apply a list of decisions using the provided managers.
 *
 * Decisions are first batched for optimization, then applied in order.
 * Returns a summary of what was applied.
 */
export function applyDecisions(decisions: Decision[], ctx: DispatchContext): ApplyResult {
  const result: ApplyResult = {
    applied: 0,
    tokensCreated: [],
    tokensDispatched: [],
    errors: [],
  };

  // Optimize: batch compatible decisions
  const batched = batchDecisions(decisions);

  for (const decision of batched) {
    try {
      const outcome = applyOne(decision, ctx);

      result.applied++;

      if (outcome.createdTokens) {
        result.tokensCreated.push(...outcome.createdTokens);
      }
      if (outcome.dispatchedTokens) {
        result.tokensDispatched.push(...outcome.dispatchedTokens);
      }
    } catch (error) {
      result.errors.push({
        decision,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // Log but don't stop - try remaining decisions
      ctx.emitter.emitTrace({
        type: 'dispatch.error',
        decision_type: decision.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Emit batch completion trace
  ctx.emitter.emitTrace({
    type: 'dispatch.batch.complete',
    total_decisions: decisions.length,
    batched_decisions: batched.length,
    applied: result.applied,
    tokens_created: result.tokensCreated.length,
    tokens_dispatched: result.tokensDispatched.length,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Apply decisions with tracing metadata.
 * Wraps each decision with source and timestamp info.
 */
export function applyTracedDecisions(traced: TracedDecision[], ctx: DispatchContext): ApplyResult {
  // Emit trace for each decision
  for (const t of traced) {
    ctx.emitter.emitTrace({
      type: 'dispatch.decision.planned',
      decision_type: t.decision.type,
      source: t.source,
      token_id: t.tokenId ?? undefined,
      timestamp: t.timestamp,
    });
  }

  // Apply underlying decisions
  return applyDecisions(
    traced.map((t) => t.decision),
    ctx,
  );
}

// ============================================================================
// Individual Decision Application
// ============================================================================

type ApplyOutcome = {
  createdTokens?: string[];
  dispatchedTokens?: string[];
};

/**
 * Apply a single decision to the appropriate manager.
 */
function applyOne(decision: Decision, ctx: DispatchContext): ApplyOutcome {
  switch (decision.type) {
    // Token operations
    case 'CREATE_TOKEN': {
      const tokenId = ctx.tokens.create(decision.params);
      ctx.emitter.emitTrace({
        type: 'dispatch.token.created',
        token_id: tokenId,
        node_id: decision.params.node_id,
      });
      return { createdTokens: [tokenId] };
    }

    case 'BATCH_CREATE_TOKENS': {
      const tokenIds: string[] = [];
      for (const params of decision.allParams) {
        const tokenId = ctx.tokens.create(params);
        tokenIds.push(tokenId);
      }
      ctx.emitter.emitTrace({
        type: 'dispatch.tokens.batch_created',
        count: tokenIds.length,
      });
      return { createdTokens: tokenIds };
    }

    case 'UPDATE_TOKEN_STATUS': {
      ctx.tokens.updateStatus(decision.tokenId, decision.status);
      ctx.emitter.emitTrace({
        type: 'dispatch.token.status_updated',
        token_id: decision.tokenId,
        status: decision.status,
      });
      return {};
    }

    case 'BATCH_UPDATE_STATUS': {
      for (const update of decision.updates) {
        ctx.tokens.updateStatus(update.tokenId, update.status);
      }
      ctx.emitter.emitTrace({
        type: 'dispatch.tokens.batch_status_updated',
        count: decision.updates.length,
      });
      return {};
    }

    case 'MARK_WAITING': {
      ctx.tokens.markWaitingForSiblings(decision.tokenId, decision.arrivedAt);
      ctx.emitter.emitTrace({
        type: 'dispatch.token.marked_waiting',
        token_id: decision.tokenId,
      });
      return {};
    }

    case 'MARK_FOR_DISPATCH': {
      ctx.tokens.updateStatus(decision.tokenId, 'dispatched');
      ctx.emitter.emitTrace({
        type: 'dispatch.token.marked_for_dispatch',
        token_id: decision.tokenId,
      });
      return { dispatchedTokens: [decision.tokenId] };
    }

    // Context operations
    case 'SET_CONTEXT': {
      ctx.context.set(decision.path, decision.value);
      ctx.emitter.emitTrace({
        type: 'dispatch.context.set',
        path: decision.path,
      });
      return {};
    }

    case 'APPLY_OUTPUT': {
      // APPLY_OUTPUT writes to a path in context - use set() directly
      // The decision.path indicates where to write, decision.output is the value
      ctx.context.set(decision.path, decision.output);
      ctx.emitter.emitTrace({
        type: 'dispatch.context.output_applied',
        path: decision.path,
      });
      return {};
    }

    // Branch storage operations
    case 'INIT_BRANCH_TABLE': {
      ctx.context.initializeBranchTable(decision.tokenId, decision.outputSchema as JSONSchema);
      ctx.emitter.emitTrace({
        type: 'dispatch.branch.table_initialized',
        token_id: decision.tokenId,
      });
      return {};
    }

    case 'APPLY_BRANCH_OUTPUT': {
      ctx.context.applyBranchOutput(decision.tokenId, decision.output);
      ctx.emitter.emitTrace({
        type: 'dispatch.branch.output_applied',
        token_id: decision.tokenId,
      });
      return {};
    }

    case 'MERGE_BRANCHES': {
      // First get the branch outputs, then merge them
      const branchOutputs = ctx.context.getBranchOutputs(
        decision.tokenIds,
        decision.branchIndices,
        decision.outputSchema as JSONSchema,
      );
      ctx.context.mergeBranches(branchOutputs, decision.merge);
      ctx.emitter.emitTrace({
        type: 'dispatch.branch.merged',
        token_ids: decision.tokenIds,
        target: decision.merge.target,
        strategy: decision.merge.strategy,
      });
      return {};
    }

    case 'DROP_BRANCH_TABLES': {
      ctx.context.dropBranchTables(decision.tokenIds);
      ctx.emitter.emitTrace({
        type: 'dispatch.branch.tables_dropped',
        token_ids: decision.tokenIds,
      });
      return {};
    }

    // Synchronization (these trigger further planning)
    case 'CHECK_SYNCHRONIZATION': {
      // This is a meta-decision that triggers synchronization planning
      // The actual planning happens in the coordinator's main loop
      ctx.emitter.emitTrace({
        type: 'dispatch.sync.check_requested',
        token_id: decision.tokenId,
        transition_id: decision.transition.id,
      });
      return {};
    }

    case 'ACTIVATE_FAN_IN': {
      // Fan-in activation - creates a new merged token
      ctx.emitter.emitTrace({
        type: 'dispatch.sync.fan_in_activated',
        node_id: decision.nodeId,
        fan_in_path: decision.fanInPath,
        merged_count: decision.mergedTokenIds.length,
      });
      return {};
    }

    // Workflow lifecycle
    case 'COMPLETE_WORKFLOW': {
      ctx.emitter.emitTrace({
        type: 'dispatch.workflow.completed',
        has_output: Object.keys(decision.output).length > 0,
      });
      return {};
    }

    case 'FAIL_WORKFLOW': {
      ctx.emitter.emitTrace({
        type: 'dispatch.workflow.failed',
        error: decision.error,
      });
      return {};
    }

    default: {
      // Exhaustive check
      const _exhaustive: never = decision;
      throw new Error(`Unknown decision type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
