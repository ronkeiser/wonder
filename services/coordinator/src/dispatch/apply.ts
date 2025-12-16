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
import type { Logger } from '@wonder/logs';
import type { JSONSchema } from '@wonder/schemas';

import type { ContextManager } from '../operations/context';
import type { DefinitionManager } from '../operations/defs';
import type { TokenManager } from '../operations/tokens';
import type { Decision, TracedDecision } from '../types';

import { batchDecisions } from './batch';

// ============================================================================
// Types
// ============================================================================

/** Resource service bindings for fetching TaskDefs etc */
export type ResourcesBinding = {
  taskDefs: () => {
    get: (
      id: string,
      version: number,
    ) => Promise<{ task_def: { id: string; output_schema?: unknown } }>;
  };
};

/** Executor service binding for dispatching tasks */
export type ExecutorBinding = {
  executeTask: (params: {
    token_id: string;
    workflow_run_id: string;
    task_id: string;
    task_version: number;
    input: Record<string, unknown>;
    resources: Record<string, string>;
  }) => Promise<void>;
};

/** Dependencies required to apply decisions and orchestrate workflow */
export type DispatchContext = {
  tokens: TokenManager;
  context: ContextManager;
  defs: DefinitionManager;
  emitter: Emitter;
  logger: Logger;
  workflowRunId: string;
  /** Resource service for fetching TaskDefs */
  resources: ResourcesBinding;
  /** Executor service for dispatching tasks */
  executor: ExecutorBinding;
  /** Register background work (fire-and-forget) */
  waitUntil: (promise: Promise<unknown>) => void;
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

      // Emit workflow event for token creation milestone
      ctx.emitter.emit({
        event_type: 'token.created',
        message: 'Token created',
        metadata: {
          token_id: tokenId,
          node_id: decision.params.node_id,
          branch_index: decision.params.branch_index,
          branch_total: decision.params.branch_total,
        },
      });

      return { createdTokens: [tokenId] };
    }

    case 'BATCH_CREATE_TOKENS': {
      const tokenIds: string[] = [];
      for (const params of decision.allParams) {
        const tokenId = ctx.tokens.create(params);
        tokenIds.push(tokenId);
      }

      // Emit workflow event for fan-out (parallel branch creation)
      ctx.emitter.emit({
        event_type: 'fan_out.started',
        message: 'Fan-out started',
        metadata: {
          token_count: tokenIds.length,
          target_node_id: decision.allParams[0]?.node_id,
          branch_total: decision.allParams[0]?.branch_total,
        },
      });

      return { createdTokens: tokenIds };
    }

    case 'UPDATE_TOKEN_STATUS': {
      const token = ctx.tokens.get(decision.tokenId);
      ctx.tokens.updateStatus(decision.tokenId, decision.status);

      // Emit workflow event for terminal states (significant milestones)
      if (decision.status === 'completed') {
        ctx.emitter.emit({
          event_type: 'token.completed',
          message: 'Token completed',
          metadata: {
            token_id: decision.tokenId,
            node_id: token.node_id,
          },
        });
      } else if (decision.status === 'failed') {
        ctx.emitter.emit({
          event_type: 'token.failed',
          message: 'Token failed',
          metadata: {
            token_id: decision.tokenId,
            node_id: token.node_id,
          },
        });
      }

      return {};
    }

    case 'BATCH_UPDATE_STATUS': {
      for (const update of decision.updates) {
        ctx.tokens.updateStatus(update.tokenId, update.status);
      }
      return {};
    }

    case 'MARK_WAITING': {
      const token = ctx.tokens.get(decision.tokenId);
      ctx.tokens.markWaitingForSiblings(decision.tokenId, decision.arrivedAt);

      // Emit workflow event for waiting state (important for debugging delays)
      ctx.emitter.emit({
        event_type: 'token.waiting',
        message: 'Token waiting for siblings',
        metadata: {
          token_id: decision.tokenId,
          node_id: token.node_id,
          arrived_at: decision.arrivedAt.toISOString(),
        },
      });

      return {};
    }

    case 'MARK_FOR_DISPATCH': {
      ctx.tokens.updateStatus(decision.tokenId, 'dispatched');
      return { dispatchedTokens: [decision.tokenId] };
    }

    // Context operations
    case 'SET_CONTEXT': {
      ctx.context.setField(decision.path, decision.value);

      // Emit workflow event for context update
      ctx.emitter.emit({
        event_type: 'context.updated',
        message: 'Context updated',
        metadata: {
          path: decision.path,
          has_value: decision.value !== null && decision.value !== undefined,
        },
      });

      return {};
    }

    case 'APPLY_OUTPUT': {
      // APPLY_OUTPUT writes to a path in context - use setField for nested paths
      ctx.context.setField(decision.path, decision.output);

      // Emit workflow event for task output application
      ctx.emitter.emit({
        event_type: 'context.output_applied',
        message: 'Task output applied to context',
        metadata: {
          path: decision.path,
          output_keys: Object.keys(decision.output),
        },
      });

      return {};
    }

    // Branch storage operations
    case 'INIT_BRANCH_TABLE': {
      ctx.context.initializeBranchTable(decision.tokenId, decision.outputSchema as JSONSchema);

      return {};
    }

    case 'APPLY_BRANCH_OUTPUT': {
      ctx.context.applyBranchOutput(decision.tokenId, decision.output);
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

      // Emit workflow event for branch merge completion
      ctx.emitter.emit({
        event_type: 'branches.merged',
        message: 'Branches merged',
        metadata: {
          branch_count: decision.tokenIds.length,
          merge_strategy: decision.merge.strategy,
          merge_target: decision.merge.target,
        },
      });

      return {};
    }

    case 'DROP_BRANCH_TABLES': {
      ctx.context.dropBranchTables(decision.tokenIds);
      return {};
    }

    // Synchronization (these trigger further planning)
    case 'CHECK_SYNCHRONIZATION': {
      // This is a meta-decision that triggers synchronization planning
      // The actual planning happens in the coordinator's main loop
      return {};
    }

    case 'ACTIVATE_FAN_IN': {
      // Fan-in activation - creates a new merged token
      ctx.emitter.emit({
        event_type: 'fan_in.completed',
        message: 'Fan-in synchronization completed',
        metadata: {
          node_id: decision.nodeId,
          fan_in_path: decision.fanInPath,
          merged_count: decision.mergedTokenIds.length,
        },
      });
      return {};
    }

    // Workflow lifecycle
    case 'COMPLETE_WORKFLOW': {
      ctx.emitter.emit({
        event_type: 'workflow.completed',
        message: 'Workflow completed successfully',
        metadata: {
          has_output: Object.keys(decision.output).length > 0,
          output_keys: Object.keys(decision.output),
        },
      });
      return {};
    }

    case 'FAIL_WORKFLOW': {
      ctx.emitter.emit({
        event_type: 'workflow.failed',
        message: 'Workflow failed',
        metadata: {
          error: decision.error,
        },
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
