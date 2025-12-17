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
import type { Decision } from '../types';
import type { PlanningResult } from './routing';

// ============================================================================
// Workflow Start
// ============================================================================

/**
 * Decide initial token creation when workflow starts.
 *
 * Creates the root token at the workflow's initial node.
 *
 * Returns both decisions and trace events for observability.
 */
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
      workflow_run_id: workflowRunId,
      initial_node_id: initialNodeId,
    },
  });

  // Create initial root token
  decisions.push({
    type: 'CREATE_TOKEN',
    params: {
      workflow_run_id: workflowRunId,
      node_id: initialNodeId,
      parent_token_id: null,
      path_id: 'root',
      sibling_group: null,
      branch_index: 0,
      branch_total: 1,
    },
  });

  events.push({
    type: 'decision.lifecycle.root_token_planned',
    payload: { node_id: initialNodeId },
  });

  return { decisions, events };
}
