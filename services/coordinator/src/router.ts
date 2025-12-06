/**
 * Router
 *
 * Decides what happens after a token completes.
 * Evaluates transitions, creates new tokens, checks workflow completion.
 */

import type { Emitter, EventContext } from '@wonder/events';
import type { Logger } from '@wonder/logs';
import * as context from './context';
import type { TokenManager, TokenRow } from './tokens';

export interface RoutingDecision {
  tokensToDispatch: string[];
  workflowComplete: boolean;
  finalOutput?: Record<string, unknown>;
}

export interface RouteParams {
  completed_token_id: string;
  workflow_run_id: string;
  tokens: TokenManager;
  sql: SqlStorage;
  env: Env;
  emitter: Emitter;
}

type SynchronizationConfig = {
  wait_for: 'any' | 'all' | { m_of_n: number };
  joins_transition: string;
  merge?: {
    source: string;
    target: string;
    strategy: 'append' | 'merge' | 'keyed' | 'last_wins';
  };
};

type TransitionDef = {
  id: string;
  ref: string;
  from_node_id: string;
  to_node_id: string;
  priority: number;
  spawn_count?: number;
  synchronization?: SynchronizationConfig;
};

type NodeDef = {
  id: string;
  ref: string;
  name: string;
};

type WorkflowDef = {
  workflow_def: {
    output_mapping?: Record<string, string>;
  };
  nodes: NodeDef[];
  transitions: TransitionDef[];
};

type WorkflowRun = {
  workflow_run: {
    workflow_def_id: string;
    workflow_version: number;
    workspace_id: string;
    project_id: string;
    parent_run_id: string | null;
  };
};

/**
 * Router handles workflow routing decisions
 */
export class Router {
  constructor(private logger: Logger) {}

  /**
   * Decide what happens after a token completes
   */
  async decide(params: RouteParams): Promise<RoutingDecision> {
    const { completed_token_id, workflow_run_id, tokens, sql, env, emitter } = params;

    this.logger.info({
      event_type: 'ROUTER_DECIDE_START',
      message: 'Router.decide() called',
      trace_id: workflow_run_id,
      metadata: { completed_token_id, workflow_run_id },
    });

    // Load workflow context
    const tokenRow = tokens.getToken(completed_token_id);
    const { workflowDef, workflowRun, node, eventContext } = await this.loadWorkflowContext(
      env,
      workflow_run_id,
      tokenRow,
    );

    this.logTokenInfo(workflow_run_id, completed_token_id, tokenRow);
    this.logNodeInfo(workflow_run_id, node);

    // Get transitions from completed node
    const transitions = this.getOutgoingTransitions(workflowDef, node.id, workflow_run_id);

    // Process each transition
    const tokensToDispatch: string[] = [];

    for (const transition of transitions) {
      this.logTransitionStart(workflow_run_id, transition);

      const spawnCount = transition.spawn_count ?? 1;

      // Handle synchronization if configured
      if (transition.synchronization) {
        const handled = await this.handleSynchronization(
          {
            transition,
            tokenRow,
            spawnCount,
            workflow_run_id,
            workflowDef,
            node,
            sql,
            tokens,
          },
          tokensToDispatch,
        );

        if (handled) {
          continue;
        }
      }

      // Create new tokens for this transition
      this.createTokensForTransition({
        transition,
        tokenRow,
        spawnCount,
        workflow_run_id,
        completed_token_id,
        node,
        tokens,
        emitter,
        eventContext,
        tokensToDispatch,
      });
    }

    // Check workflow completion atomically
    const activeCount = tokens.getActiveTokenCount(workflow_run_id);
    this.logger.info({
      event_type: 'ROUTER_ACTIVE_COUNT',
      message: 'Retrieved active token count',
      trace_id: workflow_run_id,
      metadata: { active_count: activeCount, is_complete: activeCount === 0 },
    });

    if (activeCount === 0) {
      // Atomically mark as completed - only one handler will succeed
      const markedComplete = tokens.markWorkflowComplete(workflow_run_id);

      if (markedComplete) {
        // This handler won the race - handle completion
        return this.handleWorkflowCompletion(
          workflowDef,
          workflow_run_id,
          node,
          sql,
          emitter,
          eventContext,
          tokensToDispatch,
        );
      } else {
        // Another handler already completed the workflow
        this.logger.info({
          event_type: 'ROUTER_ALREADY_COMPLETED',
          message: 'Workflow already marked complete by another handler',
          trace_id: workflow_run_id,
        });
      }
    }

    this.logger.info({
      event_type: 'ROUTER_DECIDE_END',
      message: 'Router.decide() complete',
      trace_id: workflow_run_id,
      metadata: {
        completed_token_id,
        tokens_to_dispatch: tokensToDispatch,
        workflow_complete: false,
      },
    });

    return {
      tokensToDispatch,
      workflowComplete: false,
    };
  }

  /**
   * Load workflow context (definitions, run info, node, event context)
   */
  private async loadWorkflowContext(
    env: Env,
    workflow_run_id: string,
    tokenRow: TokenRow,
  ): Promise<{
    workflowDef: WorkflowDef;
    workflowRun: WorkflowRun;
    node: NodeDef;
    eventContext: EventContext;
  }> {
    using workflowRuns = env.RESOURCES.workflowRuns();
    const workflowRun = (await workflowRuns.get(workflow_run_id)) as WorkflowRun;

    using workflowDefs = env.RESOURCES.workflowDefs();
    const workflowDef = (await workflowDefs.get(
      workflowRun.workflow_run.workflow_def_id,
      workflowRun.workflow_run.workflow_version,
    )) as WorkflowDef;

    const node = workflowDef.nodes.find((n) => n.id === tokenRow.node_id);
    if (!node) {
      this.logger.error({
        event_type: 'ROUTER_NODE_NOT_FOUND',
        message: `Node not found: ${tokenRow.node_id}`,
        trace_id: workflow_run_id,
        metadata: {
          node_id: tokenRow.node_id,
          available_nodes: workflowDef.nodes.map((n) => n.id),
        },
      });
      throw new Error(`Node not found: ${tokenRow.node_id}`);
    }

    const eventContext: EventContext = {
      workflow_run_id,
      workspace_id: workflowRun.workflow_run.workspace_id,
      project_id: workflowRun.workflow_run.project_id,
      workflow_def_id: workflowRun.workflow_run.workflow_def_id,
      parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
    };

    return { workflowDef, workflowRun, node, eventContext };
  }

  /**
   * Get outgoing transitions from a node
   */
  private getOutgoingTransitions(
    workflowDef: WorkflowDef,
    nodeId: string,
    workflow_run_id: string,
  ): TransitionDef[] {
    const transitions = workflowDef.transitions.filter((t) => t.from_node_id === nodeId);

    this.logger.info({
      event_type: 'transitions_queried',
      message: 'Transitions queried for completed node',
      trace_id: workflow_run_id,
      metadata: {
        node_id: nodeId,
        transition_count: transitions.length,
        transitions: transitions.map((t) => ({
          id: t.id,
          from_node_id: t.from_node_id,
          to_node_id: t.to_node_id,
          priority: t.priority,
        })),
      },
    });

    return transitions;
  }

  /**
   * Handle synchronization logic for a transition
   * Returns true if the transition was fully handled (skip token creation)
   */
  private async handleSynchronization(
    params: {
      transition: TransitionDef;
      tokenRow: TokenRow;
      spawnCount: number;
      workflow_run_id: string;
      workflowDef: WorkflowDef;
      node: NodeDef;
      sql: SqlStorage;
      tokens: TokenManager;
    },
    tokensToDispatch: string[],
  ): Promise<boolean> {
    const { transition, tokenRow, workflow_run_id, workflowDef, node, sql, tokens } = params;
    const syncConfig = transition.synchronization!;

    this.logger.info({
      event_type: 'ROUTER_SYNC_FOUND',
      message: 'Transition has synchronization config',
      trace_id: workflow_run_id,
      metadata: { transition_id: transition.id, synchronization: syncConfig },
    });

    // Resolve joins_transition ref to ID
    const joinsTransition = workflowDef.transitions.find(
      (t) => t.ref === syncConfig.joins_transition,
    );
    if (!joinsTransition) {
      this.logger.error({
        event_type: 'invalid_joins_transition',
        message: `joins_transition ref not found: ${syncConfig.joins_transition}`,
        trace_id: workflow_run_id,
        metadata: {
          joins_transition_ref: syncConfig.joins_transition,
          transition_id: transition.id,
        },
      });
      return true; // Skip this transition
    }

    const joinsTransitionId = joinsTransition.id;
    this.logger.info({
      event_type: 'ROUTER_JOINS_RESOLVED',
      message: 'Resolved joins_transition ref to ID',
      trace_id: workflow_run_id,
      metadata: {
        joins_transition_ref: syncConfig.joins_transition,
        joins_transition_id: joinsTransitionId,
      },
    });

    // Verify completed token belongs to the sibling group
    if (tokenRow.fan_out_transition_id !== joinsTransitionId) {
      this.logger.info({
        event_type: 'ROUTER_NOT_SIBLING',
        message: 'Completed token not part of sibling group - pass through',
        trace_id: workflow_run_id,
        metadata: {
          completed_token_fan_out_id: tokenRow.fan_out_transition_id,
          joins_transition_id: joinsTransitionId,
        },
      });
      return false; // Not a sibling, proceed with normal token creation
    }

    this.logger.info({
      event_type: 'ROUTER_IS_SIBLING',
      message: 'Completed token IS part of sibling group - applying synchronization',
      trace_id: workflow_run_id,
      metadata: { joins_transition_id: joinsTransitionId },
    });

    // Check synchronization condition FIRST (before creating token)
    const siblings = tokens.getSiblingsByFanOutTransition(workflow_run_id, joinsTransitionId);
    const conditionMet = this.checkSynchronizationCondition(siblings, syncConfig.wait_for);

    this.logger.info({
      event_type: 'SYNC_CONDITION_CHECK',
      message: 'Condition check result',
      trace_id: workflow_run_id,
      metadata: {
        should_proceed: conditionMet.shouldProceed,
        finished_count: conditionMet.finishedCount,
        total_count: conditionMet.totalCount,
      },
    });

    // Try to atomically create a fan-in token
    // Use the sibling group's common path prefix to create a stable fan-in path
    // Extract parent path by removing the last segment (branch index)
    const pathSegments = (tokenRow.path_id as string).split('.');
    const parentPath = pathSegments.slice(0, -1).join('.');
    const fanInPath = `${parentPath}.fanin`;

    const createdTokenId = tokens.tryCreateFanInToken({
      workflow_run_id,
      node_id: transition.to_node_id,
      parent_token_id: tokenRow.id as string, // Doesn't matter which sibling
      path_id: fanInPath,
    });

    if (createdTokenId === null) {
      // Token already exists - someone else is handling it
      this.logger.info({
        event_type: 'SYNC_TOKEN_ALREADY_EXISTS',
        message: 'Fan-in token already created by another sibling',
        trace_id: workflow_run_id,
      });

      // If condition is met, try to activate the existing token
      if (conditionMet.shouldProceed) {
        const existingTokens = tokens.getTokensByNodeAndFanOut(
          workflow_run_id,
          transition.to_node_id,
          joinsTransitionId,
        );

        if (existingTokens.length > 0) {
          const waitingToken = existingTokens[0];
          const activated = tokens.tryActivateWaitingToken(waitingToken.id as string);

          if (activated) {
            this.logger.info({
              event_type: 'fan_in_condition_met',
              message: 'Won race to activate waiting token',
              trace_id: workflow_run_id,
              metadata: {
                activated_token_id: waitingToken.id,
                finished_count: conditionMet.finishedCount,
                total_count: conditionMet.totalCount,
              },
            });

            // Merge branch outputs if configured
            if (syncConfig.merge) {
              this.mergeBranchOutputs(sql, node.ref, syncConfig.merge, workflow_run_id);
            }

            tokensToDispatch.push(waitingToken.id as string);

            this.logger.info({
              event_type: 'ROUTER_TOKEN_DISPATCHED',
              message: 'Token added to dispatch queue',
              trace_id: workflow_run_id,
              metadata: { token_id: waitingToken.id, dispatch_queue_size: tokensToDispatch.length },
            });
          } else {
            this.logger.info({
              event_type: 'SYNC_LOST_ACTIVATION_RACE',
              message: 'Lost race to activate - another sibling won',
              trace_id: workflow_run_id,
            });
          }
        }
      } else {
        this.logger.info({
          event_type: 'SYNC_CONDITION_NOT_MET',
          message: 'Condition not met yet, waiting',
          trace_id: workflow_run_id,
        });
      }

      return true; // Skip normal token creation
    }

    // We created the token - log it
    this.logger.info({
      event_type: 'SYNC_TOKEN_CREATED',
      message: 'Created new fan-in waiting token',
      trace_id: workflow_run_id,
      metadata: { token_id: createdTokenId },
    });

    // If condition is already met, activate immediately
    if (conditionMet.shouldProceed) {
      this.logger.info({
        event_type: 'fan_in_condition_met',
        message: 'Condition already met, activating immediately',
        trace_id: workflow_run_id,
        metadata: {
          token_id: createdTokenId,
          finished_count: conditionMet.finishedCount,
          total_count: conditionMet.totalCount,
        },
      });

      // Merge branch outputs if configured
      if (syncConfig.merge) {
        this.mergeBranchOutputs(sql, node.ref, syncConfig.merge, workflow_run_id);
      }

      const activated = tokens.tryActivateWaitingToken(createdTokenId);
      if (activated) {
        tokensToDispatch.push(createdTokenId);
        this.logger.info({
          event_type: 'ROUTER_TOKEN_DISPATCHED',
          message: 'Token added to dispatch queue',
          trace_id: workflow_run_id,
          metadata: { token_id: createdTokenId, dispatch_queue_size: tokensToDispatch.length },
        });
      }
    } else {
      this.logger.info({
        event_type: 'SYNC_WAITING',
        message: 'Token waiting for more siblings',
        trace_id: workflow_run_id,
        metadata: {
          token_id: createdTokenId,
          finished_count: conditionMet.finishedCount,
          total_count: conditionMet.totalCount,
        },
      });
    }

    return true; // Skip normal token creation
  }

  /**
   * Check if synchronization condition is met
   */
  private checkSynchronizationCondition(
    siblings: TokenRow[],
    waitFor: 'any' | 'all' | { m_of_n: number },
  ): { shouldProceed: boolean; finishedCount: number; totalCount: number } {
    const terminalStates = ['completed', 'failed', 'timed_out', 'cancelled'];
    const finishedSiblings = siblings.filter((s) => terminalStates.includes(s.status as string));
    const finishedCount = finishedSiblings.length;
    const totalCount = siblings.length;

    let shouldProceed = false;
    if (waitFor === 'any') {
      shouldProceed = finishedCount > 0;
    } else if (waitFor === 'all') {
      shouldProceed = finishedCount === totalCount;
    } else if (typeof waitFor === 'object' && 'm_of_n' in waitFor) {
      shouldProceed = finishedCount >= waitFor.m_of_n;
    }

    return { shouldProceed, finishedCount, totalCount };
  }

  /**
   * Merge branch outputs according to merge config
   */
  private mergeBranchOutputs(
    sql: SqlStorage,
    nodeRef: string,
    mergeConfig: { source: string; target: string; strategy: string },
    workflow_run_id: string,
  ): void {
    this.logger.info({
      event_type: 'ROUTER_MERGE_START',
      message: 'Starting branch merge',
      trace_id: workflow_run_id,
      metadata: { merge_config: mergeConfig, node_ref: nodeRef },
    });

    const branchOutputs = context.getBranchOutputs(sql, nodeRef);

    this.logger.info({
      event_type: 'ROUTER_BRANCH_OUTPUTS_RETRIEVED',
      message: 'Retrieved branch outputs for merge',
      trace_id: workflow_run_id,
      metadata: { node_ref: nodeRef, branch_count: branchOutputs.length },
    });

    let mergedData: unknown;
    if (mergeConfig.source === '*') {
      mergedData = branchOutputs;
    } else if (mergeConfig.source.startsWith('*.')) {
      const fieldPath = mergeConfig.source.slice(2);
      mergedData = branchOutputs.map((output) => {
        const keys = fieldPath.split('.');
        let value: any = output;
        for (const key of keys) {
          value = value?.[key];
        }
        return value;
      });
      this.logger.info({
        event_type: 'ROUTER_MERGE_STRATEGY_EXTRACT',
        message: 'Extracted field from each branch output',
        trace_id: workflow_run_id,
        metadata: { source_pattern: mergeConfig.source, field_path: fieldPath },
      });
    } else {
      mergedData = branchOutputs;
      this.logger.warn({
        event_type: 'ROUTER_MERGE_STRATEGY_UNKNOWN',
        message: 'Unknown source pattern, using full outputs',
        trace_id: workflow_run_id,
        metadata: { source_pattern: mergeConfig.source },
      });
    }

    const targetPath = mergeConfig.target.replace('$.', '');
    context.setContextValue(sql, targetPath, mergedData);

    this.logger.info({
      event_type: 'branches_merged',
      message: `Merged ${branchOutputs.length} branch outputs`,
      trace_id: workflow_run_id,
      metadata: {
        node_ref: nodeRef,
        target_path: targetPath,
        branch_count: branchOutputs.length,
        source_pattern: mergeConfig.source,
      },
    });
  }

  /**
   * Create tokens for a transition
   */
  private createTokensForTransition(params: {
    transition: TransitionDef;
    tokenRow: TokenRow;
    spawnCount: number;
    workflow_run_id: string;
    completed_token_id: string;
    node: NodeDef;
    tokens: TokenManager;
    emitter: Emitter;
    eventContext: EventContext;
    tokensToDispatch: string[];
  }): void {
    const {
      transition,
      tokenRow,
      spawnCount,
      workflow_run_id,
      completed_token_id,
      node,
      tokens,
      emitter,
      eventContext,
      tokensToDispatch,
    } = params;

    this.logger.info({
      event_type: 'ROUTER_TOKEN_CREATION_LOOP_START',
      message: `Starting token creation loop (spawn_count=${spawnCount})`,
      trace_id: workflow_run_id,
      metadata: {
        transition_id: transition.id,
        spawn_count: spawnCount,
        parent_token_id: completed_token_id,
      },
    });

    for (let i = 0; i < spawnCount; i++) {
      const newPathId = `${tokenRow.path_id}.${node.ref}.${i}`;

      const nextTokenId = tokens.createToken({
        workflow_run_id,
        node_id: transition.to_node_id,
        parent_token_id: completed_token_id,
        path_id: newPathId,
        fan_out_transition_id: transition.id,
        branch_index: i,
        branch_total: spawnCount,
      });

      emitter.emit(eventContext, {
        event_type: 'token_spawned',
        node_id: transition.to_node_id,
        token_id: nextTokenId,
        message: `Token spawned (${i + 1}/${spawnCount})`,
        metadata: {
          parent_token_id: completed_token_id,
          transition_id: transition.id,
          path_id: newPathId,
          branch_index: i,
          branch_total: spawnCount,
          fan_out_transition_id: transition.id,
        },
      });

      this.logger.info({
        event_type: 'token_created',
        message: `Token created (${i + 1}/${spawnCount})`,
        trace_id: workflow_run_id,
        metadata: {
          new_token_id: nextTokenId,
          transition_id: transition.id,
          path_id: newPathId,
          branch_index: i,
          branch_total: spawnCount,
        },
      });

      // Determine if token should wait or dispatch
      if (this.shouldTokenWait(transition)) {
        tokens.updateTokenStatus(nextTokenId, 'waiting_for_siblings');
        this.logger.info({
          event_type: 'SYNC_TOKEN_WAITING',
          message: 'Token marked as waiting for siblings',
          trace_id: workflow_run_id,
          metadata: { token_id: nextTokenId },
        });
      } else {
        tokensToDispatch.push(nextTokenId);
      }
    }
  }

  /**
   * Determine if a newly created token should wait for siblings
   */
  private shouldTokenWait(transition: TransitionDef): boolean {
    if (!transition.synchronization) {
      return false;
    }

    const syncConfig = transition.synchronization;

    // Only wait if wait_for is not 'any'
    return syncConfig.wait_for !== 'any';
  }

  /**
   * Handle workflow completion
   */
  private handleWorkflowCompletion(
    workflowDef: WorkflowDef,
    workflow_run_id: string,
    node: NodeDef,
    sql: SqlStorage,
    emitter: Emitter,
    eventContext: EventContext,
    tokensToDispatch: string[],
  ): RoutingDecision {
    this.logger.info({
      event_type: 'ROUTER_WORKFLOW_COMPLETE',
      message: 'No active tokens remaining - workflow is complete',
      trace_id: workflow_run_id,
    });

    const finalOutput = this.extractFinalOutput(workflowDef, sql, workflow_run_id);

    this.logger.info({
      event_type: 'workflow_completed',
      message: 'Workflow execution completed',
      trace_id: workflow_run_id,
      highlight: 'green',
      metadata: {
        workflow_run_id,
        last_completed_node_id: node.id,
        last_completed_node_ref: node.ref,
        final_output: finalOutput,
      },
    });

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

  /**
   * Extract final output using output_mapping
   */
  private extractFinalOutput(
    workflowDef: WorkflowDef,
    sql: SqlStorage,
    workflow_run_id: string,
  ): Record<string, unknown> {
    const finalOutput: Record<string, unknown> = {};

    this.logger.info({
      event_type: 'extracting_final_output',
      message: 'Evaluating output_mapping',
      trace_id: workflow_run_id,
      metadata: {
        has_output_mapping: !!workflowDef.workflow_def.output_mapping,
      },
    });

    if (!workflowDef.workflow_def.output_mapping) {
      return finalOutput;
    }

    this.logger.info({
      event_type: 'ROUTER_OUTPUT_MAPPING_START',
      message: 'Processing output mapping entries',
      trace_id: workflow_run_id,
      metadata: {
        entry_count: Object.keys(workflowDef.workflow_def.output_mapping).length,
      },
    });

    for (const [key, jsonPath] of Object.entries(workflowDef.workflow_def.output_mapping)) {
      const pathStr = jsonPath as string;

      if (!pathStr.startsWith('$.')) {
        continue;
      }

      const contextPath = pathStr.slice(2);

      // Check if this is a branch collection path
      if (contextPath.endsWith('._branches')) {
        const nodeRef = contextPath.replace('_output._branches', '');
        const branchOutputs = context.getBranchOutputs(sql, nodeRef);

        if (branchOutputs.length > 0) {
          finalOutput[key] = branchOutputs;
        }
      } else {
        const value = context.getContextValue(sql, contextPath);

        if (value !== undefined) {
          finalOutput[key] = value;
        }
      }

      this.logger.info({
        event_type: 'ROUTER_OUTPUT_ENTRY',
        message: `Processed output mapping entry: ${key}`,
        trace_id: workflow_run_id,
        metadata: {
          output_key: key,
          json_path: pathStr,
          has_value: finalOutput[key] !== undefined,
        },
      });
    }

    return finalOutput;
  }

  /**
   * Log token information
   */
  private logTokenInfo(workflow_run_id: string, token_id: string, tokenRow: TokenRow): void {
    this.logger.info({
      event_type: 'ROUTER_TOKEN_INFO',
      message: 'Retrieved completed token info',
      trace_id: workflow_run_id,
      metadata: {
        completed_token_id: token_id,
        node_id: tokenRow.node_id,
        path_id: tokenRow.path_id,
        fan_out_transition_id: tokenRow.fan_out_transition_id,
        branch_index: tokenRow.branch_index,
        branch_total: tokenRow.branch_total,
        status: tokenRow.status,
      },
    });
  }

  /**
   * Log node information
   */
  private logNodeInfo(workflow_run_id: string, node: NodeDef): void {
    this.logger.info({
      event_type: 'ROUTER_NODE_FOUND',
      message: 'Found completed node in workflow def',
      trace_id: workflow_run_id,
      metadata: {
        node_id: node.id,
        node_ref: node.ref,
        node_name: node.name,
      },
    });
  }

  /**
   * Log transition start
   */
  private logTransitionStart(workflow_run_id: string, transition: TransitionDef): void {
    this.logger.info({
      event_type: 'transition_evaluated',
      message: `Transition evaluated: spawning ${transition.spawn_count ?? 1} token(s)`,
      trace_id: workflow_run_id,
      metadata: {
        transition_id: transition.id,
        from_node_id: transition.from_node_id,
        to_node_id: transition.to_node_id,
        spawn_count: transition.spawn_count ?? 1,
      },
    });
  }
}
