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
 * - Check sibling completion to trigger fan-in
 * - Process synchronization conditions
 * - Execute fan-in merge when conditions met
 */

import type { JSONSchema } from '@wonder/schemas';
import type { DefinitionManager } from '../operations/defs';
import type { TokenManager } from '../operations/tokens';
import { decideFanInContinuation, toTransitionDef } from '../planning/index';
import { decideSynchronization } from '../planning/synchronization';
import type { Decision, TransitionDef } from '../types';
import { applyDecisions, type DispatchContext } from './apply';

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
 * 4. Check if sibling completion triggers fan-in
 */
export async function handleBranchOutput(
  ctx: DispatchContext,
  token: Token,
  node: Node,
  output: Record<string, unknown>,
): Promise<string | null> {
  // Fetch TaskDef to get output schema
  if (!node.task_id) {
    ctx.logger.debug({
      event_type: 'branch.output.skip',
      message: 'No task_id on node - skipping branch output',
      metadata: { token_id: token.id, node_id: node.id },
    });
    return null;
  }

  const taskDefsResource = ctx.resources.taskDefs();
  const { task_def: taskDef } = await taskDefsResource.get(node.task_id, node.task_version ?? 1);

  if (!taskDef.output_schema) {
    ctx.logger.debug({
      event_type: 'branch.output.skip',
      message: 'No output_schema on TaskDef - skipping branch output',
      metadata: { token_id: token.id, task_id: taskDef.id },
    });
    return null;
  }

  // Initialize branch table (creates if not exists)
  ctx.context.initializeBranchTable(token.id, taskDef.output_schema as JSONSchema);

  // Write output to branch table
  ctx.context.applyBranchOutput(token.id, output);

  ctx.emitter.emitTrace({
    type: 'operation.context.branch.written',
    token_id: token.id,
    payload: { output },
  });

  // Check if this completion triggers fan-in for waiting siblings
  return await checkSiblingCompletion(ctx, token);
}

// ============================================================================
// Sibling Completion Check
// ============================================================================

/**
 * Check if a completed branch token triggers fan-in for waiting siblings
 *
 * When a fan-out token completes:
 * 1. Find tokens waiting for this sibling group
 * 2. Re-evaluate synchronization condition
 * 3. If condition now met, trigger fan-in activation
 */
export async function checkSiblingCompletion(
  ctx: DispatchContext,
  completedToken: Token,
): Promise<string | null> {
  if (!completedToken.fan_out_transition_id) {
    return null; // Not a fan-out token, nothing to check
  }

  const workflowRunId = completedToken.workflow_run_id;

  // Get the transition that spawned this fan-out
  const fanOutTransition = ctx.defs.getTransition(completedToken.fan_out_transition_id);
  if (!fanOutTransition) {
    return null;
  }

  // Find the next transition (from the same source node) that has synchronization
  const outboundTransitions = ctx.defs.getTransitionsFrom(fanOutTransition.from_node_id);
  const syncTransitionRow = outboundTransitions.find((t) => {
    const sync = t.synchronization as { sibling_group?: string } | null;
    return sync?.sibling_group === fanOutTransition.id;
  });

  if (!syncTransitionRow || !syncTransitionRow.synchronization) {
    return null; // No sync transition for this fan-out group
  }

  // Cast synchronization to typed config
  const syncTransition = toTransitionDef(syncTransitionRow);
  const siblingGroup = syncTransition.synchronization!.sibling_group;

  // Check for tokens waiting for this sibling group
  const waitingTokens = ctx.tokens.getWaitingTokens(workflowRunId, siblingGroup);
  if (waitingTokens.length === 0) {
    return null; // No one waiting yet
  }

  // Re-evaluate synchronization with current sibling counts
  const siblingCounts = ctx.tokens.getSiblingCounts(workflowRunId, siblingGroup);

  // Check if any waiting token should now activate fan-in
  // We only need to check one (they all have the same view of siblings)
  const waitingToken = waitingTokens[0];

  const syncResult = decideSynchronization({
    token: waitingToken,
    transition: syncTransition,
    siblingCounts,
    workflowRunId,
  });

  // Emit trace events
  for (const event of syncResult.events) {
    ctx.emitter.emitTrace(event);
  }

  // Process any ACTIVATE_FAN_IN decisions
  for (const decision of syncResult.decisions) {
    if (decision.type === 'ACTIVATE_FAN_IN') {
      const continuationTokenId = await activateFanIn(
        ctx,
        decision,
        syncTransition,
        waitingToken.id,
      );
      if (continuationTokenId) {
        return continuationTokenId;
      }
    }
  }
  return null;
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
  syncTransitions: TransitionDef[],
): Promise<string[]> {
  const continuationTokenIds: string[] = [];

  for (const createdTokenId of createdTokenIds) {
    const createdToken = ctx.tokens.get(createdTokenId);

    // Find matching sync transition for this token's target node
    const syncTransition = syncTransitions.find((t) => t.to_node_id === createdToken.node_id);

    if (syncTransition && syncTransition.synchronization) {
      // Get sibling counts for synchronization check
      const siblingGroup = syncTransition.synchronization.sibling_group;
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
          applyDecisions([decision], ctx);
        }
      }
    } else {
      // No synchronization - mark for dispatch
      ctx.tokens.updateStatus(createdTokenId, 'dispatched');
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
 * 1. Try to activate (race-safe via SQL constraint)
 * 2. If won the race:
 *    - Query all completed siblings
 *    - Fetch TaskDef for output schema
 *    - Merge branch outputs
 *    - Drop branch tables
 *    - Create continuation token
 *    - Mark waiting siblings as completed
 */
export async function activateFanIn(
  ctx: DispatchContext,
  decision: Extract<Decision, { type: 'ACTIVATE_FAN_IN' }>,
  transition: TransitionDef,
  triggeringTokenId: string,
): Promise<string | null> {
  const { workflowRunId, nodeId, fanInPath } = decision;

  // First ensure the fan-in record exists (create if not present)
  // This handles the race where all tokens arrive at sync point simultaneously
  ctx.tokens.tryCreateFanIn({
    workflowRunId,
    nodeId,
    fanInPath,
    transitionId: transition.id,
    tokenId: triggeringTokenId,
  });

  // Try to activate - first caller wins
  // Use the triggering token ID for race-safe deduplication
  const activated = ctx.tokens.tryActivateFanIn({
    workflowRunId,
    fanInPath,
    activatedByTokenId: triggeringTokenId,
  });

  if (!activated) {
    // Another token already activated this fan-in
    // Mark the triggering token as completed (absorbed by the winning token's fan-in)
    ctx.tokens.updateStatus(triggeringTokenId, 'completed');
    ctx.logger.debug({
      event_type: 'fan_in.race.lost',
      message: 'Another token already activated this fan-in',
      metadata: { fan_in_path: fanInPath },
    });
    return null;
  }

  // We won the race - proceed with merge
  ctx.emitter.emitTrace({
    type: 'dispatch.sync.fan_in_activated',
    node_id: nodeId,
    payload: {
      fan_in_path: fanInPath,
      merged_count: decision.mergedTokenIds.length,
    },
  });

  const sync = transition.synchronization;
  if (!sync) {
    return null; // Should not happen
  }

  // Get all completed siblings
  const siblings = ctx.tokens.getSiblings(workflowRunId, sync.sibling_group);
  const completedSiblings = siblings.filter((s) => s.status === 'completed');
  const waitingSiblings = siblings.filter((s) => s.status === 'waiting_for_siblings');

  if (completedSiblings.length === 0) {
    ctx.logger.debug({
      event_type: 'fan_in.no_completed',
      message: 'No completed siblings found',
      metadata: { fan_in_path: fanInPath },
    });
    return null;
  }

  // Get merge config
  const mergeConfig = sync.merge;
  if (mergeConfig) {
    // Fetch TaskDef to get output schema (from the source node of the fan-out transition)
    const sourceNode = ctx.defs.getNode(transition.from_node_id);

    if (sourceNode.task_id) {
      const taskDefsResource = ctx.resources.taskDefs();
      const { task_def: taskDef } = await taskDefsResource.get(
        sourceNode.task_id,
        sourceNode.task_version ?? 1,
      );

      if (taskDef.output_schema) {
        // Get branch outputs
        const branchOutputs = ctx.context.getBranchOutputs(
          completedSiblings.map((s) => s.id),
          completedSiblings.map((s) => s.branch_index),
          taskDef.output_schema as JSONSchema,
        );

        // Merge into context
        ctx.context.mergeBranches(branchOutputs, mergeConfig);
      }
    }

    // Drop branch tables
    ctx.context.dropBranchTables(completedSiblings.map((s) => s.id));
  }

  // Mark waiting siblings as completed (absorbed by merge)
  if (waitingSiblings.length > 0) {
    ctx.tokens.completeMany(waitingSiblings.map((s) => s.id));
  }

  // Mark the triggering token as completed (it activated the fan-in but is now absorbed)
  ctx.tokens.updateStatus(triggeringTokenId, 'completed');

  // Plan continuation token creation (pure function)
  const firstSibling = completedSiblings[0];
  const continuationResult = decideFanInContinuation({
    workflowRunId,
    nodeId,
    fanInPath,
    parentTokenId: firstSibling.parent_token_id ?? '',
  });

  // Emit trace events from planning
  for (const event of continuationResult.events) {
    ctx.emitter.emitTrace(event);
  }

  // Apply planning decisions (creates continuation token)
  const applyResult = applyDecisions(continuationResult.decisions, ctx);

  // Get the created continuation token ID
  if (applyResult.tokensCreated.length === 0) {
    ctx.logger.debug({
      event_type: 'fan_in.no_continuation',
      message: 'No continuation token created',
      metadata: { fan_in_path: fanInPath },
    });
    return null;
  }

  const continuationTokenId = applyResult.tokensCreated[0];

  // Return continuation token ID for caller to dispatch
  return continuationTokenId;
}
