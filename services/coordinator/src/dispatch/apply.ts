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

import type { JSONSchema } from '@wonder/schemas';

import type { ApplyResult, Decision, DispatchContext, TracedDecision } from '../types';

import { batchDecisions } from './batch';

// ============================================================================
// Main Dispatch Entry Point
// ============================================================================

/**
 * Apply a list of decisions using the provided managers.
 *
 * Decisions are first batched for optimization, then applied in order.
 * Returns a summary of what was applied.
 */
export async function applyDecisions(decisions: Decision[], ctx: DispatchContext): Promise<ApplyResult> {
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
      const outcome = await applyOne(decision, ctx);

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
        payload: {
          decisionType: decision.type,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  // Emit batch completion trace
  ctx.emitter.emitTrace({
    type: 'dispatch.batch.complete',
    payload: {
      totalDecisions: decisions.length,
      batchedDecisions: batched.length,
      applied: result.applied,
      tokensCreated: result.tokensCreated.length,
      tokensDispatched: result.tokensDispatched.length,
      errors: result.errors.length,
    },
  });

  return result;
}

/**
 * Apply decisions with tracing metadata.
 * Wraps each decision with source and timestamp info.
 */
export async function applyTracedDecisions(
  traced: TracedDecision[],
  ctx: DispatchContext,
): Promise<ApplyResult> {
  // Emit trace for each decision
  for (const t of traced) {
    ctx.emitter.emitTrace({
      type: 'dispatch.decision.planned',
      tokenId: t.tokenId ?? undefined,
      payload: {
        decisionType: t.decision.type,
        source: t.source,
        timestamp: t.timestamp,
      },
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
async function applyOne(decision: Decision, ctx: DispatchContext): Promise<ApplyOutcome> {
  switch (decision.type) {
    // Token operations
    case 'CREATE_TOKEN': {
      const tokenId = ctx.tokens.create(decision.params);

      // Emit workflow event for token creation milestone
      ctx.emitter.emit({
        eventType: 'token.created',
        message: 'Token created',
        metadata: {
          tokenId: tokenId,
          nodeId: decision.params.nodeId,
          branchIndex: decision.params.branchIndex,
          branchTotal: decision.params.branchTotal,
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
        eventType: 'fan_out.started',
        message: 'Fan-out started',
        metadata: {
          tokenCount: tokenIds.length,
          targetNodeId: decision.allParams[0]?.nodeId,
          branchTotal: decision.allParams[0]?.branchTotal,
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
          eventType: 'token.completed',
          message: 'Token completed',
          metadata: {
            tokenId: decision.tokenId,
            nodeId: token.nodeId,
          },
        });
      } else if (decision.status === 'failed') {
        ctx.emitter.emit({
          eventType: 'token.failed',
          message: 'Token failed',
          metadata: {
            tokenId: decision.tokenId,
            nodeId: token.nodeId,
          },
        });
      } else if (decision.status === 'timed_out') {
        ctx.emitter.emit({
          eventType: 'token.timed_out',
          message: 'Token timed out waiting for siblings',
          metadata: {
            tokenId: decision.tokenId,
            nodeId: token.nodeId,
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
        eventType: 'token.waiting',
        message: 'Token waiting for siblings',
        metadata: {
          tokenId: decision.tokenId,
          nodeId: token.nodeId,
          arrivedAt: decision.arrivedAt.toISOString(),
        },
      });

      // Schedule timeout alarm if configured for this sibling group
      if (token.siblingGroup) {
        const transitions = ctx.defs.getTransitions();
        const syncTransition = transitions.find(
          (t) => t.synchronization?.siblingGroup === token.siblingGroup,
        );
        if (syncTransition?.synchronization?.timeoutMs) {
          // Fire-and-forget the alarm scheduling
          ctx.waitUntil(ctx.scheduleAlarm(syncTransition.synchronization.timeoutMs));
        }
      }

      return {};
    }

    case 'MARK_FOR_DISPATCH': {
      ctx.tokens.updateStatus(decision.tokenId, 'dispatched');
      return { dispatchedTokens: [decision.tokenId] };
    }

    case 'COMPLETE_TOKEN': {
      const token = ctx.tokens.get(decision.tokenId);
      ctx.tokens.updateStatus(decision.tokenId, 'completed');

      ctx.emitter.emit({
        eventType: 'token.completed',
        message: 'Token completed',
        metadata: {
          tokenId: decision.tokenId,
          nodeId: token.nodeId,
        },
      });

      return {};
    }

    case 'COMPLETE_TOKENS': {
      ctx.tokens.completeMany(decision.tokenIds);

      // Emit events for each completed token
      for (const tokenId of decision.tokenIds) {
        const token = ctx.tokens.get(tokenId);
        ctx.emitter.emit({
          eventType: 'token.completed',
          message: 'Token completed',
          metadata: {
            tokenId: tokenId,
            nodeId: token.nodeId,
          },
        });
      }

      return {};
    }

    case 'CANCEL_TOKENS': {
      ctx.tokens.cancelMany(decision.tokenIds, decision.reason);

      // Emit events for each cancelled token
      for (const tokenId of decision.tokenIds) {
        const token = ctx.tokens.get(tokenId);
        ctx.emitter.emit({
          eventType: 'token.cancelled',
          message: 'Token cancelled',
          metadata: {
            tokenId: tokenId,
            nodeId: token.nodeId,
            reason: decision.reason,
          },
        });
      }

      return {};
    }

    // Context operations
    case 'SET_CONTEXT': {
      ctx.context.setField(decision.path, decision.value);

      // Emit workflow event for context update
      ctx.emitter.emit({
        eventType: 'context.updated',
        message: 'Context updated',
        metadata: {
          path: decision.path,
          hasValue: decision.value !== null && decision.value !== undefined,
        },
      });

      return {};
    }

    case 'APPLY_OUTPUT': {
      // APPLY_OUTPUT writes to a path in context - use setField for nested paths
      ctx.context.setField(decision.path, decision.output);

      // Emit workflow event for task output application
      ctx.emitter.emit({
        eventType: 'context.output_applied',
        message: 'Task output applied to context',
        metadata: {
          path: decision.path,
          outputKeys: Object.keys(decision.output),
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
        eventType: 'branches.merged',
        message: 'Branches merged',
        metadata: {
          branchCount: decision.tokenIds.length,
          mergeStrategy: decision.merge.strategy,
          mergeTarget: decision.merge.target,
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
        eventType: 'fan_in.completed',
        message: 'Fan-in synchronization completed',
        metadata: {
          nodeId: decision.nodeId,
          fanInPath: decision.fanInPath,
          mergedCount: decision.mergedTokenIds.length,
        },
      });
      return {};
    }

    // Workflow lifecycle
    case 'INITIALIZE_WORKFLOW': {
      // Initialize workflow status to 'running'
      ctx.status.initialize(ctx.workflowRunId);

      // Initialize context tables and store input
      await ctx.context.initialize(decision.input);

      // Emit workflow started event
      ctx.emitter.emit({
        eventType: 'workflow.started',
        message: 'Workflow started',
        metadata: { input: decision.input },
      });

      return {};
    }

    case 'COMPLETE_WORKFLOW': {
      // Guard: Check if workflow is already in terminal state
      if (ctx.status.isTerminal(ctx.workflowRunId)) {
        ctx.logger.debug({
          eventType: 'workflow.complete.skipped',
          message: 'Workflow already in terminal state, skipping completion',
          metadata: { workflowRunId: ctx.workflowRunId },
        });
        return {};
      }

      // Mark workflow as completed in coordinator DO (returns false if already terminal)
      const marked = ctx.status.markCompleted(ctx.workflowRunId);
      if (!marked) {
        return {};
      }

      // Emit workflow.completed event
      ctx.emitter.emit({
        eventType: 'workflow.completed',
        message: 'Workflow completed successfully',
        metadata: {
          output: decision.output,
        },
      });

      // Update workflow run status in resources service
      const workflowRunsResource = ctx.resources.workflowRuns();
      await workflowRunsResource.complete(ctx.workflowRunId, decision.output);

      return {};
    }

    case 'FAIL_WORKFLOW': {
      // Guard: Check if workflow is already in terminal state
      if (ctx.status.isTerminal(ctx.workflowRunId)) {
        ctx.logger.debug({
          eventType: 'workflow.fail.skipped',
          message: 'Workflow already in terminal state, skipping failure',
          metadata: { workflowRunId: ctx.workflowRunId, error: decision.error },
        });
        return {};
      }

      // Mark workflow as failed in coordinator DO (returns false if already terminal)
      const marked = ctx.status.markFailed(ctx.workflowRunId);
      if (!marked) {
        return {};
      }

      // Cancel all active tokens to prevent further processing
      const activeTokens = ctx.tokens.getActiveTokens(ctx.workflowRunId);
      if (activeTokens.length > 0) {
        ctx.tokens.cancelMany(
          activeTokens.map((t) => t.id),
          `workflow failed: ${decision.error}`,
        );
      }

      // Emit workflow.failed event
      ctx.emitter.emit({
        eventType: 'workflow.failed',
        message: `Workflow failed: ${decision.error}`,
        metadata: { error: decision.error },
      });

      // Update workflow run status in resources service
      const workflowRunsResource = ctx.resources.workflowRuns();
      await workflowRunsResource.updateStatus(ctx.workflowRunId, 'failed');

      return {};
    }

    // Dispatch operations
    case 'DISPATCH_TOKEN': {
      // Import dispatchToken dynamically to avoid circular dependency
      // The actual dispatch is handled by the caller after applyDecisions returns
      // This decision just marks the token for dispatch
      ctx.tokens.updateStatus(decision.tokenId, 'dispatched');
      return { dispatchedTokens: [decision.tokenId] };
    }

    default: {
      // Exhaustive check
      const _exhaustive: never = decision;
      throw new Error(`Unknown decision type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
