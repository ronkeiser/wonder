/**
 * Fan-Out/Fan-In Dispatch
 *
 * Handles parallel branch execution (fan-out) and result merging (fan-in).
 *
 * Fan-out: Single token spawns multiple parallel branch tokens
 * Fan-in: Multiple completed branches merge back into single continuation token
 *
 * Key responsibilities:
 * - Write branch outputs to isolated branch tables
 * - Process synchronization conditions (single deterministic path)
 * - Execute fan-in merge when conditions met
 */

import type { DefinitionManager } from '../operations/defs';
import type { TokenManager } from '../operations/tokens';
import { decideFanInContinuation } from '../planning/index';
import { decideSynchronization } from '../planning/synchronization';
import type { Decision, DispatchContext, Transition } from '../types';
import { applyDecisions } from './apply';

// ============================================================================
// Types
// ============================================================================

/** Token shape returned by TokenManager.get() */
type Token = ReturnType<TokenManager['get']>;

/** Node shape returned by DefinitionManager.getNode() */
type Node = ReturnType<DefinitionManager['getNode']>;

// ============================================================================
// Branch Output Handling
// ============================================================================

/**
 * Handle branch output for fan-out tokens
 *
 * 1. Fetch TaskDef to get output_schema
 * 2. Initialize branch table (lazy - creates if not exists)
 * 3. Write task output to branch table
 * 4. Apply any state.* mappings from node's outputMapping to shared context
 *
 * Note: Fan-in activation is handled by processSynchronization in the routing
 * path, ensuring a single deterministic path for all sync logic.
 */
export async function handleBranchOutput(
  ctx: DispatchContext,
  token: Token,
  node: Node,
  output: Record<string, unknown>,
): Promise<void> {
  // Fetch TaskDef to get output schema
  if (!node.taskId) {
    ctx.logger.debug({
      eventType: 'branch.output.skip',
      message: 'No taskId on node - skipping branch output',
      metadata: { tokenId: token.id, nodeId: node.id },
    });
    return;
  }

  const tasksResource = ctx.resources.tasks();
  const { task } = await tasksResource.get(node.taskId, node.taskVersion ?? 1);

  if (!task.outputSchema) {
    ctx.logger.debug({
      eventType: 'branch.output.skip',
      message: 'No output_schema on Task - skipping branch output',
      metadata: { tokenId: token.id, taskId: task.id },
    });
    return;
  }

  // Initialize branch table and write output via decisions
  await applyDecisions(
    [
      { type: 'INIT_BRANCH_TABLE', tokenId: token.id, outputSchema: task.outputSchema },
      { type: 'APPLY_BRANCH_OUTPUT', tokenId: token.id, output },
    ],
    ctx,
  );

  ctx.emitter.emitTrace({
    type: 'operation.context.branch.written',
    tokenId: token.id,
    payload: { output },
  });

  // Apply state.* mappings from node's outputMapping to shared context
  // This allows fan-out branches to write to shared state in addition to their branch output
  // (output.* mappings are handled by the branch table, state.* go to shared context)
  const outputMapping = node.outputMapping as Record<string, string> | null;
  if (outputMapping) {
    // Filter to only state.* mappings (not output.* which go to branch table)
    const stateMappings: Record<string, string> = {};
    for (const [target, source] of Object.entries(outputMapping)) {
      if (target.startsWith('state.')) {
        stateMappings[target] = source;
      }
    }

    // Apply state mappings if any exist
    if (Object.keys(stateMappings).length > 0) {
      ctx.context.applyOutputMapping(stateMappings, output);
    }
  }
}

// ============================================================================
// Synchronization Processing
// ============================================================================

/**
 * Process synchronization for created tokens
 *
 * For each created token, check if it has a synchronization condition:
 * - If sync condition met: activate fan-in
 * - If sync condition not met: mark token as waiting
 * - If no sync: mark token as dispatched (ready to execute)
 *
 * Returns array of continuation token IDs that need to be dispatched
 */
export async function processSynchronization(
  ctx: DispatchContext,
  createdTokenIds: string[],
  syncTransitions: Transition[],
): Promise<string[]> {
  const continuationTokenIds: string[] = [];

  for (const createdTokenId of createdTokenIds) {
    const createdToken = ctx.tokens.get(createdTokenId);

    // Find matching sync transition for this token's target node
    const syncTransition = syncTransitions.find((t) => t.toNodeId === createdToken.nodeId);

    if (syncTransition && syncTransition.synchronization) {
      // Get sibling counts for synchronization check
      const siblingGroup = syncTransition.synchronization.siblingGroup;
      const siblingCounts = ctx.tokens.getSiblingCounts(ctx.workflowRunId, siblingGroup);

      // Plan synchronization decisions (returns decisions + trace events)
      const syncResult = decideSynchronization({
        token: createdToken,
        transition: syncTransition,
        siblingCounts,
        workflowRunId: ctx.workflowRunId,
      });

      // Emit trace events from sync planning
      for (const event of syncResult.events) {
        ctx.emitter.emitTrace(event);
      }

      // Process decisions - handle ACTIVATE_FAN_IN specially (needs async operations)
      for (const decision of syncResult.decisions) {
        if (decision.type === 'ACTIVATE_FAN_IN') {
          const continuationTokenId = await activateFanIn(
            ctx,
            decision,
            syncTransition,
            createdTokenId,
          );
          if (continuationTokenId) {
            continuationTokenIds.push(continuationTokenId);
          }
        } else {
          await applyDecisions([decision], ctx);
        }
      }
    } else {
      // No synchronization - mark for dispatch via decision
      await applyDecisions([{ type: 'MARK_FOR_DISPATCH', tokenId: createdTokenId }], ctx);
    }
  }

  return continuationTokenIds;
}

// ============================================================================
// Fan-In Activation
// ============================================================================

/**
 * Handle ACTIVATE_FAN_IN decision
 *
 * This is called when synchronization condition is met:
 * 1. Try to win the fan-in race (race-safe via SQL constraint)
 * 2. If won: merge siblings and create continuation token
 */
export async function activateFanIn(
  ctx: DispatchContext,
  decision: Extract<Decision, { type: 'ACTIVATE_FAN_IN' }>,
  transition: Transition,
  triggeringTokenId: string,
): Promise<string | null> {
  const { workflowRunId, nodeId, fanInPath } = decision;

  // Step 1: Try to win the fan-in race
  const raceWon = tryWinFanInRace(ctx, {
    workflowRunId,
    nodeId,
    fanInPath,
    transitionId: transition.id,
    triggeringTokenId,
  });

  if (!raceWon) {
    // Lost the race - fan-in was already activated by another token.
    // Mark this arrival token as completed so it reaches a terminal state.
    await applyDecisions([{ type: 'COMPLETE_TOKEN', tokenId: triggeringTokenId }], ctx);
    ctx.emitter.emitTrace({
      type: 'dispatch.sync.fan_in_race_lost',
      tokenId: triggeringTokenId,
      nodeId: nodeId,
      payload: { fanInPath },
    });
    return null;
  }

  // Step 2: Get siblings for merge
  const sync = transition.synchronization;
  if (!sync) {
    return null;
  }

  const siblings = getSiblingsForMerge(ctx, workflowRunId, sync.siblingGroup, fanInPath);
  if (!siblings) {
    return null;
  }

  const { completedSiblings, waitingSiblings, inFlightSiblings } = siblings;

  // Emit trace event
  ctx.emitter.emitTrace({
    type: 'dispatch.sync.fan_in_activated',
    nodeId: nodeId,
    payload: {
      fanInPath: fanInPath,
      mergedCount: completedSiblings.length,
      waitingCount: waitingSiblings.length,
      cancelledCount: inFlightSiblings.length,
    },
  });

  // Step 3: Merge branch outputs if configured
  if (sync.merge) {
    await mergeBranchOutputs(ctx, transition.fromNodeId, completedSiblings, sync.merge);
  }

  // Step 4: Mark waiting siblings as completed and cancel in-flight siblings
  // In-flight siblings (dispatched/executing) are cancelled because the sync condition
  // has been met - their results are no longer needed. This prevents race conditions
  // where late-completing siblings try to proceed after the fan-in has already activated.
  // Step 5: Mark the triggering arrival token as completed
  // The arrival token has served its purpose - it triggered the fan-in activation.
  // Now the continuation token will carry the workflow forward.
  const siblingDecisions: Decision[] = [];

  // Complete waiting siblings
  if (waitingSiblings.length > 0) {
    siblingDecisions.push({
      type: 'COMPLETE_TOKENS',
      tokenIds: waitingSiblings.map((s) => s.id),
    });
  }

  // Cancel in-flight siblings
  if (inFlightSiblings.length > 0) {
    siblingDecisions.push({
      type: 'CANCEL_TOKENS',
      tokenIds: inFlightSiblings.map((s) => s.id),
      reason: 'fan-in activated before completion',
    });
  }

  // Complete the triggering token
  siblingDecisions.push({ type: 'COMPLETE_TOKEN', tokenId: triggeringTokenId });

  await applyDecisions(siblingDecisions, ctx);

  // Step 6: Create continuation token
  // Fetch parent token (fan-out origin) to inherit its iteration_counts
  const parentTokenId = completedSiblings[0].parentTokenId ?? '';
  const parentToken = parentTokenId ? ctx.tokens.get(parentTokenId) : null;

  return await createFanInContinuation(ctx, {
    workflowRunId,
    nodeId,
    fanInPath,
    parentTokenId,
    parentIterationCounts: parentToken?.iterationCounts ?? undefined,
  });
}

// ============================================================================
// Fan-In Helper Functions
// ============================================================================

/**
 * Attempt to win the fan-in race using SQL constraints.
 * Returns true if this call won the race, false if another token already activated.
 */
function tryWinFanInRace(
  ctx: DispatchContext,
  params: {
    workflowRunId: string;
    nodeId: string;
    fanInPath: string;
    transitionId: string;
    triggeringTokenId: string;
  },
): boolean {
  const { workflowRunId, nodeId, fanInPath, transitionId, triggeringTokenId } = params;

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
    // Lost the race - this is just a debug log, the caller handles token completion
    ctx.logger.debug({
      eventType: 'fan_in.race.lost',
      message: 'Another token already activated this fan-in',
      metadata: { fanInPath: fanInPath },
    });
    return false;
  }

  return true;
}

/** Token shape for sibling operations */
type SiblingToken = ReturnType<TokenManager['getSiblings']>[number];

/**
 * Get siblings categorized by state for fan-in merge.
 * Returns null if no completed siblings found.
 *
 * Categories:
 * - completed: Already finished, can be merged
 * - waiting: Arrived at sync point, waiting for condition
 * - inFlight: Still executing (dispatched/executing), need to be cancelled
 */
function getSiblingsForMerge(
  ctx: DispatchContext,
  workflowRunId: string,
  siblingGroup: string,
  fanInPath: string,
): {
  completedSiblings: SiblingToken[];
  waitingSiblings: SiblingToken[];
  inFlightSiblings: SiblingToken[];
} | null {
  const siblings = ctx.tokens.getSiblings(workflowRunId, siblingGroup);
  const completedSiblings = siblings.filter((s) => s.status === 'completed');
  const waitingSiblings = siblings.filter((s) => s.status === 'waiting_for_siblings');
  const inFlightSiblings = siblings.filter(
    (s) => s.status === 'pending' || s.status === 'dispatched' || s.status === 'executing',
  );

  if (completedSiblings.length === 0) {
    ctx.logger.debug({
      eventType: 'fan_in.no_completed',
      message: 'No completed siblings found',
      metadata: { fanInPath: fanInPath },
    });
    return null;
  }

  return { completedSiblings, waitingSiblings, inFlightSiblings };
}

/**
 * Merge branch outputs from completed siblings into main context.
 */
async function mergeBranchOutputs(
  ctx: DispatchContext,
  sourceNodeId: string,
  completedSiblings: SiblingToken[],
  mergeConfig: NonNullable<Transition['synchronization']>['merge'],
): Promise<void> {
  if (!mergeConfig) return;

  const sourceNode = ctx.defs.getNode(sourceNodeId);
  if (!sourceNode.taskId) return;

  const tasksResource = ctx.resources.tasks();
  const { task } = await tasksResource.get(
    sourceNode.taskId,
    sourceNode.taskVersion ?? 1,
  );

  if (task.outputSchema) {
    // Merge branches and clean up via decisions
    await applyDecisions(
      [
        {
          type: 'MERGE_BRANCHES',
          tokenIds: completedSiblings.map((s) => s.id),
          branchIndices: completedSiblings.map((s) => s.branchIndex),
          outputSchema: task.outputSchema,
          merge: mergeConfig,
        },
        {
          type: 'DROP_BRANCH_TABLES',
          tokenIds: completedSiblings.map((s) => s.id),
        },
      ],
      ctx,
    );
  } else {
    // No output schema - just clean up branch tables
    await applyDecisions(
      [{ type: 'DROP_BRANCH_TABLES', tokenIds: completedSiblings.map((s) => s.id) }],
      ctx,
    );
  }
}

/**
 * Create the continuation token after fan-in merge.
 */
async function createFanInContinuation(
  ctx: DispatchContext,
  params: {
    workflowRunId: string;
    nodeId: string;
    fanInPath: string;
    parentTokenId: string;
    parentIterationCounts?: Record<string, number>;
  },
): Promise<string | null> {
  const continuationResult = decideFanInContinuation(params);

  // Emit trace events
  for (const event of continuationResult.events) {
    ctx.emitter.emitTrace(event);
  }

  // Apply decisions (creates continuation token)
  const applyResult = await applyDecisions(continuationResult.decisions, ctx);

  if (applyResult.tokensCreated.length === 0) {
    ctx.logger.debug({
      eventType: 'fan_in.no_continuation',
      message: 'No continuation token created',
      metadata: { fanInPath: params.fanInPath },
    });
    return null;
  }

  return applyResult.tokensCreated[0];
}
