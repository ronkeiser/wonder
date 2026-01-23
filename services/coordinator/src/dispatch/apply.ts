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
 * - Route callbacks to agents when workflows complete
 */

import type { JSONSchema } from '@wonder/schemas';

import { errorMessage } from '../shared';
import type { ApplyResult, Decision, DispatchContext, TracedDecision } from '../types';

import { batchDecisions } from './batch';

// ============================================================================
// Agent Callback Types
// ============================================================================

/**
 * Callback metadata embedded in workflow run input by the agent.
 * Used to route workflow completion/failure back to the originating agent.
 */
type AgentCallback = {
  conversationId: string;
  turnId: string;
  toolCallId?: string;
  type: 'context_assembly' | 'memory_extraction' | 'workflow';
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
export async function applyDecisions(
  decisions: Decision[],
  ctx: DispatchContext,
): Promise<ApplyResult> {
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
      if (outcome.fanInActivated !== undefined) {
        result.fanInActivated = outcome.fanInActivated;
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
          error: errorMessage(error),
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
      payload: {
        tokenId: t.tokenId ?? undefined,
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
  fanInActivated?: boolean;
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

    case 'APPLY_OUTPUT_MAPPING': {
      // Apply output mapping to transform task output and write to context
      ctx.context.applyOutputMapping(decision.outputMapping, decision.outputData);

      // Emit workflow event for output mapping application
      if (decision.outputMapping) {
        ctx.emitter.emit({
          eventType: 'context.output_mapping_applied',
          message: 'Output mapping applied to context',
          metadata: {
            mappingKeys: Object.keys(decision.outputMapping),
            outputKeys: Object.keys(decision.outputData),
          },
        });
      }

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

    case 'TRY_ACTIVATE_FAN_IN': {
      const { workflowRunId, nodeId, fanInPath, transitionId, triggeringTokenId } = decision;

      // Ensure fan-in record exists (handles race where all tokens arrive simultaneously)
      ctx.tokens.tryCreateFanIn({
        workflowRunId,
        nodeId,
        fanInPath,
        transitionId,
        tokenId: triggeringTokenId,
      });

      // Try to activate - first caller wins
      const activated = ctx.tokens.tryActivateFanIn({
        workflowRunId,
        fanInPath,
        activatedByTokenId: triggeringTokenId,
      });

      if (!activated) {
        ctx.logger.debug({
          eventType: 'fan_in.race.lost',
          message: 'Another token already activated this fan-in',
          metadata: { fanInPath },
        });
      }

      return { fanInActivated: activated };
    }

    // Workflow lifecycle
    case 'INITIALIZE_WORKFLOW': {
      // Initialize workflow status to 'running'
      ctx.status.initialize(ctx.workflowRunId);

      // Initialize context tables and store input
      ctx.context.initialize(decision.input);

      // Emit appropriate started event based on whether this is root or subworkflow
      const isSubworkflow = ctx.workflowRunId !== ctx.rootRunId;
      ctx.emitter.emit({
        eventType: isSubworkflow ? 'subworkflow.started' : 'workflow.started',
        message: isSubworkflow ? 'Subworkflow started' : 'Workflow started',
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

      // Emit appropriate completed event based on whether this is root or subworkflow
      const isSubworkflow = ctx.workflowRunId !== ctx.rootRunId;
      ctx.emitter.emit({
        eventType: isSubworkflow ? 'subworkflow.completed' : 'workflow.completed',
        message: isSubworkflow ? 'Subworkflow completed successfully' : 'Workflow completed successfully',
        metadata: {
          output: decision.output,
        },
      });

      // If this is a sub-workflow, notify parent coordinator
      const run = ctx.defs.getWorkflowRun();

      // Update workflow run status in resources service (skip for ephemeral subworkflows)
      if (!run.parentRunId) {
        const workflowRunsResource = ctx.resources.workflowRuns();
        await workflowRunsResource.complete(ctx.workflowRunId, decision.output);
      }
      if (run.parentRunId && run.parentTokenId) {
        const parentCoordinatorId = ctx.coordinator.idFromName(run.parentRunId);
        const parentCoordinator = ctx.coordinator.get(parentCoordinatorId);

        ctx.emitter.emit({
          eventType: 'subworkflow.notifying_parent',
          message: 'Notifying parent workflow of completion',
          metadata: {
            parentRunId: run.parentRunId,
            parentTokenId: run.parentTokenId,
          },
        });

        ctx.waitUntil(
          parentCoordinator
            .handleSubworkflowResult(run.parentTokenId, decision.output)
            .then(() => {
              ctx.emitter.emit({
                eventType: 'subworkflow.parent_callback_success',
                message: 'Parent callback completed successfully',
                metadata: {
                  parentRunId: run.parentRunId,
                  parentTokenId: run.parentTokenId,
                },
              });
            })
            .catch((error) => {
              ctx.emitter.emit({
                eventType: 'subworkflow.parent_callback_error',
                message: `Parent callback failed: ${error instanceof Error ? error.message : String(error)}`,
                metadata: {
                  parentRunId: run.parentRunId,
                  parentTokenId: run.parentTokenId,
                  error: error instanceof Error ? error.stack : String(error),
                },
              });
            }),
        );
      }

      // Check for agent callback metadata in workflow run input
      const runContext = run.context as { input?: { _callback?: AgentCallback } };
      const callback = runContext.input?._callback;

      if (callback?.conversationId) {
        const agentId = ctx.agent.idFromName(callback.conversationId);
        const agent = ctx.agent.get(agentId);

        ctx.waitUntil(
          (async () => {
            switch (callback.type) {
              case 'context_assembly':
                // Workflow output contains llmRequest - pass as context
                await agent.handleContextAssemblyResult(
                  callback.turnId,
                  ctx.workflowRunId,
                  decision.output as { llmRequest: { messages: unknown[] } },
                );
                break;
              case 'memory_extraction':
                await agent.handleMemoryExtractionResult(callback.turnId, ctx.workflowRunId);
                break;
              case 'workflow':
                await agent.handleWorkflowResult(
                  callback.turnId,
                  callback.toolCallId!,
                  decision.output,
                );
                break;
            }
          })().catch((error) => {
            ctx.emitter.emitTrace({
              type: 'workflow.agent_callback.error',
              payload: {
                workflowRunId: ctx.workflowRunId,
                callbackType: callback.type,
                error: errorMessage(error),
              },
            });
          }),
        );

        ctx.emitter.emit({
          eventType: 'workflow.agent_callback.sent',
          message: `Agent callback sent: ${callback.type}`,
          metadata: {
            conversationId: callback.conversationId,
            turnId: callback.turnId,
            callbackType: callback.type,
          },
        });
      }

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

      // Cascade cancellation: cancel all running subworkflows
      const runningSubworkflows = ctx.subworkflows.getRunning(ctx.workflowRunId);
      for (const subworkflow of runningSubworkflows) {
        const subworkflowCoordinatorId = ctx.coordinator.idFromName(subworkflow.subworkflowRunId);
        const subworkflowCoordinator = ctx.coordinator.get(subworkflowCoordinatorId);
        ctx.waitUntil(subworkflowCoordinator.cancel('parent workflow failed'));
        ctx.subworkflows.updateStatus(subworkflow.subworkflowRunId, 'cancelled');
      }

      if (runningSubworkflows.length > 0) {
        ctx.emitter.emit({
          eventType: 'subworkflows.cancelled',
          message: 'Subworkflows cancelled due to parent failure',
          metadata: {
            count: runningSubworkflows.length,
            subworkflowRunIds: runningSubworkflows.map((s) => s.subworkflowRunId),
          },
        });
      }

      // Emit workflow.failed event
      ctx.emitter.emit({
        eventType: 'workflow.failed',
        message: `Workflow failed: ${decision.error}`,
        metadata: { error: decision.error },
      });

      // If this is a sub-workflow, notify parent coordinator of failure
      const run = ctx.defs.getWorkflowRun();

      // Update workflow run status in resources service (skip for ephemeral subworkflows)
      if (!run.parentRunId) {
        const workflowRunsResource = ctx.resources.workflowRuns();
        await workflowRunsResource.updateStatus(ctx.workflowRunId, 'failed');
      }
      if (run.parentRunId && run.parentTokenId) {
        const parentCoordinatorId = ctx.coordinator.idFromName(run.parentRunId);
        const parentCoordinator = ctx.coordinator.get(parentCoordinatorId);

        ctx.emitter.emit({
          eventType: 'subworkflow.notifying_parent_failure',
          message: 'Notifying parent workflow of failure',
          metadata: {
            parentRunId: run.parentRunId,
            parentTokenId: run.parentTokenId,
            error: decision.error,
          },
        });

        ctx.waitUntil(
          parentCoordinator
            .handleSubworkflowError(run.parentTokenId, decision.error)
            .then(() => {
              ctx.emitter.emit({
                eventType: 'subworkflow.parent_error_callback_success',
                message: 'Parent error callback completed successfully',
                metadata: {
                  parentRunId: run.parentRunId,
                  parentTokenId: run.parentTokenId,
                },
              });
            })
            .catch((callbackError) => {
              ctx.emitter.emit({
                eventType: 'subworkflow.parent_error_callback_error',
                message: `Parent error callback failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`,
                metadata: {
                  parentRunId: run.parentRunId,
                  parentTokenId: run.parentTokenId,
                  error: callbackError instanceof Error ? callbackError.stack : String(callbackError),
                },
              });
            }),
        );
      }

      // Check for agent callback metadata in workflow run input
      // Route errors based on callback type
      const runContext = run.context as { input?: { _callback?: AgentCallback } };
      const callback = runContext.input?._callback;

      if (callback?.conversationId) {
        const agentId = ctx.agent.idFromName(callback.conversationId);
        const agent = ctx.agent.get(agentId);

        if (callback.type === 'context_assembly') {
          // Context assembly failure is critical - fail the turn
          ctx.waitUntil(
            agent.handleContextAssemblyError(callback.turnId, ctx.workflowRunId, decision.error).catch((error) => {
              ctx.emitter.emitTrace({
                type: 'workflow.agent_callback.error',
                payload: {
                  workflowRunId: ctx.workflowRunId,
                  callbackType: 'context_assembly_error',
                  error: errorMessage(error),
                },
              });
            }),
          );

          ctx.emitter.emit({
            eventType: 'workflow.agent_callback.sent',
            message: 'Agent context assembly error callback sent',
            metadata: {
              conversationId: callback.conversationId,
              turnId: callback.turnId,
              error: decision.error,
            },
          });
        } else if (callback.type === 'memory_extraction') {
          // Memory extraction failure - turn already complete, just mark the failure
          ctx.waitUntil(
            agent.handleMemoryExtractionError(callback.turnId, ctx.workflowRunId, decision.error).catch((error) => {
              ctx.emitter.emitTrace({
                type: 'workflow.agent_callback.error',
                payload: {
                  workflowRunId: ctx.workflowRunId,
                  callbackType: 'memory_extraction_error',
                  error: errorMessage(error),
                },
              });
            }),
          );

          ctx.emitter.emit({
            eventType: 'workflow.agent_callback.sent',
            message: 'Agent memory extraction error callback sent',
            metadata: {
              conversationId: callback.conversationId,
              turnId: callback.turnId,
              error: decision.error,
            },
          });
        } else if (callback.type === 'workflow' && callback.toolCallId) {
          // Workflow tool call error
          ctx.waitUntil(
            agent.handleWorkflowError(callback.turnId, callback.toolCallId, decision.error).catch((error) => {
              ctx.emitter.emitTrace({
                type: 'workflow.agent_callback.error',
                payload: {
                  workflowRunId: ctx.workflowRunId,
                  callbackType: 'workflow_error',
                  error: errorMessage(error),
                },
              });
            }),
          );

          ctx.emitter.emit({
            eventType: 'workflow.agent_callback.sent',
            message: 'Agent workflow error callback sent',
            metadata: {
              conversationId: callback.conversationId,
              turnId: callback.turnId,
              toolCallId: callback.toolCallId,
              error: decision.error,
            },
          });
        }
      }

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

    // Subworkflow operations
    case 'MARK_WAITING_FOR_SUBWORKFLOW': {
      const token = ctx.tokens.get(decision.tokenId);
      ctx.tokens.markWaitingForSubworkflow(decision.tokenId, decision.subworkflowRunId);

      // Register subworkflow for cascade cancellation and timeout tracking
      ctx.subworkflows.register({
        workflowRunId: ctx.workflowRunId,
        parentTokenId: decision.tokenId,
        subworkflowRunId: decision.subworkflowRunId,
        timeoutMs: decision.timeoutMs,
      });

      // Emit event for parent entering waiting state
      ctx.emitter.emit({
        eventType: 'subworkflow.waiting',
        message: 'Waiting for subworkflow',
        metadata: {
          tokenId: decision.tokenId,
          nodeId: token.nodeId,
          subworkflowRunId: decision.subworkflowRunId,
          timeoutMs: decision.timeoutMs,
        },
      });

      // Schedule timeout alarm if configured
      if (decision.timeoutMs) {
        ctx.waitUntil(ctx.scheduleAlarm(decision.timeoutMs));
      }

      return {};
    }

    case 'RESUME_FROM_SUBWORKFLOW': {
      const token = ctx.tokens.get(decision.tokenId);

      // Mark subworkflow as completed
      const subworkflow = ctx.subworkflows.getByParentTokenId(decision.tokenId);
      if (subworkflow) {
        ctx.subworkflows.updateStatus(subworkflow.subworkflowRunId, 'completed');
      }

      // Emit event for parent receiving subworkflow result
      ctx.emitter.emit({
        eventType: 'subworkflow.result_received',
        message: 'Subworkflow result received',
        metadata: {
          tokenId: decision.tokenId,
          nodeId: token.nodeId,
          outputKeys: Object.keys(decision.output),
        },
      });

      // Process the result like a normal task result
      // Import processTaskResult dynamically to avoid circular dependency
      const { processTaskResult } = await import('./task');
      await processTaskResult(ctx, decision.tokenId, { outputData: decision.output });

      return {};
    }

    case 'FAIL_FROM_SUBWORKFLOW': {
      const token = ctx.tokens.get(decision.tokenId);

      // Mark subworkflow as failed
      const subworkflow = ctx.subworkflows.getByParentTokenId(decision.tokenId);
      if (subworkflow) {
        ctx.subworkflows.updateStatus(subworkflow.subworkflowRunId, 'failed');
      }

      // Mark token as failed
      ctx.tokens.updateStatus(decision.tokenId, 'failed');

      // Emit subworkflow failure event
      ctx.emitter.emit({
        eventType: 'subworkflow.failed',
        message: `Subworkflow failed: ${decision.error}`,
        metadata: {
          tokenId: decision.tokenId,
          nodeId: token.nodeId,
          error: decision.error,
        },
      });

      // Check if this should fail the parent workflow
      // For now, propagate the failure to the workflow level
      await applyDecisions(
        [{ type: 'FAIL_WORKFLOW', error: `Subworkflow failed: ${decision.error}` }],
        ctx,
      );

      return {};
    }

    case 'TIMEOUT_SUBWORKFLOW': {
      const token = ctx.tokens.get(decision.tokenId);

      // Emit timeout event
      ctx.emitter.emit({
        eventType: 'subworkflow.timeout',
        message: `Subworkflow timed out after ${decision.timeoutMs}ms`,
        metadata: {
          subworkflowRunId: decision.subworkflowRunId,
          parentTokenId: decision.tokenId,
          nodeId: token.nodeId,
          timeoutMs: decision.timeoutMs,
          elapsedMs: decision.elapsedMs,
        },
      });

      // Cancel the subworkflow
      const subworkflowCoordinatorId = ctx.coordinator.idFromName(decision.subworkflowRunId);
      const subworkflowCoordinator = ctx.coordinator.get(subworkflowCoordinatorId);
      ctx.waitUntil(subworkflowCoordinator.cancel('subworkflow timeout'));

      // Mark the subworkflow as cancelled
      ctx.subworkflows.updateStatus(decision.subworkflowRunId, 'cancelled');

      // Mark the parent token as timed out
      ctx.tokens.updateStatus(decision.tokenId, 'timed_out');

      // Fail the parent workflow
      await applyDecisions(
        [
          {
            type: 'FAIL_WORKFLOW',
            error: `Subworkflow '${decision.subworkflowRunId}' timed out after ${decision.timeoutMs}ms`,
          },
        ],
        ctx,
      );

      return {};
    }

    default: {
      // Exhaustive check
      const _exhaustive: never = decision;
      throw new Error(`Unknown decision type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
