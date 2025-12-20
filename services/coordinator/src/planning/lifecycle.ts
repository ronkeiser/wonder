/**
 * Lifecycle Decision Logic
 *
 * Pure planning module for workflow lifecycle events (start, completion, failure).
 *
 * Key principles:
 * - No side effects (pure functions)
 * - Returns { decisions, events } tuple for dispatch to execute and emit
 */

import type { TraceEventInput } from '@wonder/events';

import type { Decision, PlanningResult } from '../types';

// ============================================================================
// Workflow Start
// ============================================================================

/** Decide initial token creation when workflow starts. */
export function decideWorkflowStart(params: {
  workflowRunId: string;
  initialNodeId: string;
}): PlanningResult {
  const { workflowRunId, initialNodeId } = params;

  const events: TraceEventInput[] = [];
  const decisions: Decision[] = [];

  // Emit lifecycle start event
  events.push({
    type: 'decision.lifecycle.start',
    payload: {
      workflowRunId: workflowRunId,
      initialNodeId: initialNodeId,
    },
  });

  // Create initial root token
  decisions.push({
    type: 'CREATE_TOKEN',
    params: {
      workflowRunId: workflowRunId,
      nodeId: initialNodeId,
      parentTokenId: null,
      pathId: 'root',
      siblingGroup: null,
      branchIndex: 0,
      branchTotal: 1,
      iterationCounts: null,
    },
  });

  events.push({
    type: 'decision.lifecycle.root_token_planned',
    payload: { nodeId: initialNodeId },
  });

  return { decisions, events };
}
