/**
 * Routing Service
 *
 * Decides what happens after a token completes.
 * Evaluates transitions, creates new tokens, checks workflow completion.
 */

import type { Logger } from '@wonder/logs';
import type { Emitter, EventContext } from '@wonder/events';
import * as tokens from './tokens';
import * as context from './context';

export interface RoutingDecision {
  tokensToDispatch: string[];
  workflowComplete: boolean;
  finalOutput?: Record<string, unknown>;
}

export interface RouteParams {
  completed_token_id: string;
  workflow_run_id: string;
  sql: SqlStorage;
  env: Env;
  logger: Logger;
  emitter: Emitter;
}

/**
 * Decide what happens after a token completes
 * 
 * Evaluates transitions from completed node, creates new tokens,
 * checks synchronization, determines if workflow is complete.
 */
export async function decide(params: RouteParams): Promise<RoutingDecision> {
  const { completed_token_id, workflow_run_id, sql, env, logger, emitter } = params;

  // Get completed token info
  const tokenRow = tokens.getToken(sql, completed_token_id);
  const node_id = tokenRow.node_id as string;

  // Fetch workflow definition to get transitions
  using workflowRuns = env.RESOURCES.workflowRuns();
  const workflowRun = await workflowRuns.get(workflow_run_id);

  using workflowDefs = env.RESOURCES.workflowDefs();
  const workflowDef = await workflowDefs.get(
    workflowRun.workflow_run.workflow_def_id,
    workflowRun.workflow_run.workflow_version,
  );

  const node = workflowDef.nodes.find((n: any) => n.id === node_id);
  if (!node) {
    throw new Error(`Node not found: ${node_id}`);
  }

  // Query for transitions from completed node
  const transitions = workflowDef.transitions.filter(
    (t: any) => t.from_node_id === node_id
  );

  logger.info({
    event_type: 'transitions_queried',
    message: 'Transitions queried for completed node',
    trace_id: workflow_run_id,
    metadata: {
      token_id: completed_token_id,
      node_id,
      transition_count: transitions.length,
      transitions: transitions.map((t: any) => ({
        id: t.id,
        from_node_id: t.from_node_id,
        to_node_id: t.to_node_id,
        priority: t.priority,
      })),
    },
  });

  // Build event context
  const eventContext: EventContext = {
    workflow_run_id,
    workspace_id: workflowRun.workflow_run.workspace_id,
    project_id: workflowRun.workflow_run.project_id,
    workflow_def_id: workflowRun.workflow_run.workflow_def_id,
    parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
  };

  // Create tokens for all outgoing transitions
  const tokensToDispatch: string[] = [];

  for (const transition of transitions) {
    const nextTokenId = tokens.createToken(sql, {
      workflow_run_id,
      node_id: transition.to_node_id,
      parent_token_id: completed_token_id,
      path_id: '', // TODO: Implement proper path_id building per branching doc
      fan_out_transition_id: null, // TODO: Implement spawn_count and fan-out
      branch_index: 0,
      branch_total: 1,
    });

    // Emit token_spawned event
    emitter.emit(eventContext, {
      event_type: 'token_spawned',
      node_id: transition.to_node_id,
      token_id: nextTokenId,
      message: `Token spawned for transition to node`,
      metadata: {
        parent_token_id: completed_token_id,
        transition_id: transition.id,
      },
    });

    logger.info({
      event_type: 'transition_token_created',
      message: 'Token created for transition target node',
      trace_id: workflow_run_id,
      metadata: {
        parent_token_id: completed_token_id,
        new_token_id: nextTokenId,
        transition_id: transition.id,
        from_node_id: transition.from_node_id,
        to_node_id: transition.to_node_id,
      },
    });

    tokensToDispatch.push(nextTokenId);
  }

  // Check if workflow is complete (no pending or executing tokens remain)
  const activeCount = tokens.getActiveTokenCount(sql, workflow_run_id);

  if (activeCount === 0) {
    // Extract final output using output_mapping
    const finalOutput: Record<string, unknown> = {};
    
    logger.info({
      event_type: 'extracting_final_output',
      message: 'Evaluating output_mapping',
      trace_id: workflow_run_id,
      metadata: {
        output_mapping: workflowDef.workflow_def.output_mapping,
        has_output_mapping: !!workflowDef.workflow_def.output_mapping,
      },
    });
    
    if (workflowDef.workflow_def.output_mapping) {
      for (const [key, jsonPath] of Object.entries(workflowDef.workflow_def.output_mapping)) {
        const pathStr = jsonPath as string;
        if (pathStr.startsWith('$.')) {
          const contextPath = pathStr.slice(2); // Remove $.
          const value = context.getContextValue(sql, contextPath);
          if (value !== undefined) {
            finalOutput[key] = value;
          }
        }
      }
    }

    logger.info({
      event_type: 'workflow_completed',
      message: 'Workflow execution completed',
      trace_id: workflow_run_id,
      highlight: 'green',
      metadata: {
        workflow_run_id,
        last_completed_node_id: node_id,
        last_completed_node_ref: node.ref,
        final_output: finalOutput,
      },
    });

    // Emit workflow_completed event
    emitter.emit(eventContext, {
      event_type: 'workflow_completed',
      message: 'Workflow execution completed',
      metadata: { final_output: finalOutput },
    });

    return {
      tokensToDispatch,
      workflowComplete: true,
      finalOutput,
    };
  }

  return {
    tokensToDispatch,
    workflowComplete: false,
  };
}
