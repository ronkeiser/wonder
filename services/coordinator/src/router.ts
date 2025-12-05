/**
 * Router
 *
 * Decides what happens after a token completes.
 * Evaluates transitions, creates new tokens, checks workflow completion.
 */

import type { Emitter, EventContext } from '@wonder/events';
import type { Logger } from '@wonder/logs';
import * as context from './context';
import type { TokenManager } from './tokens';

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

/**
 * Router handles workflow routing decisions
 */
type SynchronizationConfig = {
  wait_for: 'any' | 'all' | { m_of_n: number };
  joins_transition: string;
  merge?: {
    source: string;
    target: string;
    strategy: 'append' | 'merge' | 'keyed' | 'last_wins';
  };
};

export class Router {
  constructor(private logger: Logger) {}

  /**
   * Check if synchronization condition is met
   */
  private checkSynchronizationCondition(
    finishedCount: number,
    totalCount: number,
    waitFor: 'any' | 'all' | { m_of_n: number },
  ): boolean {
    if (waitFor === 'any') {
      return finishedCount > 0;
    }
    if (waitFor === 'all') {
      return finishedCount === totalCount;
    }
    if (typeof waitFor === 'object' && 'm_of_n' in waitFor) {
      return finishedCount >= waitFor.m_of_n;
    }
    return false;
  }

  /**
   * Decide what happens after a token completes
   *
   * Evaluates transitions from completed node, creates new tokens,
   * checks synchronization, determines if workflow is complete.
   */
  async decide(params: RouteParams): Promise<RoutingDecision> {
    const { completed_token_id, workflow_run_id, tokens, sql, env, emitter } = params;

    // Get completed token info
    const tokenRow = tokens.getToken(completed_token_id);
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
    const transitions = workflowDef.transitions.filter((t: any) => t.from_node_id === node_id);

    this.logger.info({
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

    // Get the completed node's ref for path building
    const completedNodeRef = node.ref;

    // Create tokens for all outgoing transitions
    const tokensToDispatch: string[] = [];

    for (const transition of transitions) {
      // Determine spawn count (default: 1)
      const spawnCount = transition.spawn_count ?? 1;

      this.logger.info({
        event_type: 'transition_evaluated',
        message: `Transition evaluated: spawning ${spawnCount} token(s)`,
        trace_id: workflow_run_id,
        metadata: {
          transition_id: transition.id,
          from_node_id: transition.from_node_id,
          to_node_id: transition.to_node_id,
          spawn_count: spawnCount,
        },
      });

      // CHECK FOR SYNCHRONIZATION *BEFORE* CREATING TOKENS
      if (transition.synchronization) {
        const syncConfig = transition.synchronization as SynchronizationConfig;
        const joinsTransitionRef = syncConfig.joins_transition;

        // Resolve the joins_transition ref to an ID
        const joinsTransition = workflowDef.transitions.find(
          (t: any) => t.ref === joinsTransitionRef,
        );
        if (!joinsTransition) {
          this.logger.error({
            event_type: 'invalid_joins_transition',
            message: `joins_transition ref not found: ${joinsTransitionRef}`,
            trace_id: workflow_run_id,
            metadata: {
              joins_transition_ref: joinsTransitionRef,
              transition_id: transition.id,
            },
          });
          continue;
        }

        const joinsTransitionId = joinsTransition.id;

        // Verify the COMPLETED token belongs to the sibling group being joined
        if (tokenRow.fan_out_transition_id === joinsTransitionId) {
          this.logger.info({
            event_type: 'SYNC_CHECK_BEFORE_CREATE',
            message: `Checking synchronization BEFORE creating token`,
            trace_id: workflow_run_id,
            metadata: {
              completed_token_id,
              joins_transition_id: joinsTransitionId,
              to_node_id: transition.to_node_id,
            },
          });

          // Check for existing fan-in tokens BEFORE creating
          const existingFanInTokens = tokens.getTokensByNodeAndFanOut(
            workflow_run_id,
            transition.to_node_id,
            joinsTransitionId,
          );

          this.logger.info({
            event_type: 'SYNC_EXISTING_BEFORE_CREATE',
            message: `Found existing fan-in tokens`,
            trace_id: workflow_run_id,
            metadata: {
              completed_token_id,
              existing_count: existingFanInTokens.length,
              existing_tokens: existingFanInTokens.map((t) => ({
                id: t.id,
                status: t.status,
              })),
            },
          });

          // If any token already exists (waiting or active), skip creating new one
          if (existingFanInTokens.length > 0) {
            const activeTokens = existingFanInTokens.filter(
              (t) => t.status !== 'waiting_for_siblings',
            );

            if (activeTokens.length > 0) {
              this.logger.info({
                event_type: 'SYNC_SKIP_ACTIVE_EXISTS',
                message: `Skipping token creation - active token exists`,
                trace_id: workflow_run_id,
                metadata: {
                  completed_token_id,
                  existing_active_token: activeTokens[0].id,
                },
              });
              continue;
            }

            // Check if condition is now met
            const siblings = tokens.getSiblingsByFanOutTransition(
              workflow_run_id,
              joinsTransitionId,
            );
            const terminalStates = ['completed', 'failed', 'timed_out', 'cancelled'];
            const finishedSiblings = siblings.filter((s) =>
              terminalStates.includes(s.status as string),
            );

            const shouldProceed = this.checkSynchronizationCondition(
              finishedSiblings.length,
              siblings.length,
              syncConfig.wait_for,
            );

            this.logger.info({
              event_type: 'SYNC_CONDITION_CHECK',
              message: `Condition check result`,
              trace_id: workflow_run_id,
              metadata: {
                completed_token_id,
                should_proceed: shouldProceed,
                finished_count: finishedSiblings.length,
                total_count: siblings.length,
              },
            });

            if (shouldProceed) {
              // Activate the waiting token
              const waitingToken = existingFanInTokens[0];

              this.logger.info({
                event_type: 'fan_in_condition_met',
                message: `Activating existing waiting token`,
                trace_id: workflow_run_id,
                metadata: {
                  completed_token_id,
                  activated_token_id: waitingToken.id,
                  finished_count: finishedSiblings.length,
                  total_count: siblings.length,
                },
              });

              // Merge branch outputs if needed
              if (syncConfig.merge) {
                const mergeConfig = syncConfig.merge;
                const nodeRefForMerge = node.ref;
                const branchOutputs = context.getBranchOutputs(sql, nodeRefForMerge);

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
                } else {
                  mergedData = branchOutputs;
                }

                const targetPath = mergeConfig.target.replace('$.', '');
                context.setContextValue(sql, targetPath, mergedData);

                this.logger.info({
                  event_type: 'branches_merged',
                  message: `Merged ${branchOutputs.length} branch outputs`,
                  trace_id: workflow_run_id,
                  metadata: {
                    node_ref: nodeRefForMerge,
                    target_path: targetPath,
                    branch_count: branchOutputs.length,
                    source_pattern: mergeConfig.source,
                  },
                });
              }

              // Activate and dispatch
              tokens.updateTokenStatus(waitingToken.id as string, 'pending');
              tokensToDispatch.push(waitingToken.id as string);
            } else {
              this.logger.info({
                event_type: 'SYNC_SKIP_ALREADY_WAITING',
                message: `Skipping token creation - already waiting`,
                trace_id: workflow_run_id,
                metadata: {
                  completed_token_id,
                  existing_waiting_token: existingFanInTokens[0].id,
                },
              });
            }
            continue;
          }
        }
      }

      // Create spawn_count tokens for this transition
      for (let i = 0; i < spawnCount; i++) {
        // Build path_id: parent_path.nodeRef.branchIndex
        // Example: root.hello_node.0, root.hello_node.1, root.hello_node.2
        const newPathId = `${tokenRow.path_id}.${completedNodeRef}.${i}`;

        const nextTokenId = tokens.createToken({
          workflow_run_id,
          node_id: transition.to_node_id,
          parent_token_id: completed_token_id,
          path_id: newPathId,
          fan_out_transition_id: transition.id, // All siblings share this transition ID
          branch_index: i,
          branch_total: spawnCount,
        });

        // Emit token_spawned event
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
            parent_token_id: completed_token_id,
            new_token_id: nextTokenId,
            transition_id: transition.id,
            from_node_id: transition.from_node_id,
            to_node_id: transition.to_node_id,
            path_id: newPathId,
            branch_index: i,
            branch_total: spawnCount,
          },
        });

        // Check if newly created token needs to wait (only for first token created)
        if (transition.synchronization) {
          const syncConfig = transition.synchronization as SynchronizationConfig;
          const joinsTransitionRef = syncConfig.joins_transition;

          const joinsTransition = workflowDef.transitions.find(
            (t: any) => t.ref === joinsTransitionRef,
          );
          if (!joinsTransition) {
            tokensToDispatch.push(nextTokenId);
            continue;
          }

          const joinsTransitionId = joinsTransition.id;

          // Only apply if completed token belongs to the sibling group
          if (tokenRow.fan_out_transition_id === joinsTransitionId) {
            const waitFor = syncConfig.wait_for;

            if (waitFor === 'any') {
              tokensToDispatch.push(nextTokenId);
            } else {
              // Check if condition is met for this newly created token
              const siblings = tokens.getSiblingsByFanOutTransition(
                workflow_run_id,
                joinsTransitionId,
              );
              const terminalStates = ['completed', 'failed', 'timed_out', 'cancelled'];
              const finishedSiblings = siblings.filter((s) =>
                terminalStates.includes(s.status as string),
              );

              // This should never happen - we handled synchronization before creating token
              // But just in case, mark as waiting
              this.logger.warn({
                event_type: 'SYNC_UNEXPECTED_PATH',
                message: `Unexpected: token created when sync should have been handled before`,
                trace_id: workflow_run_id,
                metadata: {
                  new_token_id: nextTokenId,
                  finished_count: finishedSiblings.length,
                  total_count: siblings.length,
                },
              });

              tokens.updateTokenStatus(nextTokenId, 'waiting_for_siblings');
            }
          } else {
            // Token doesn't belong to this sibling group - pass through
            tokensToDispatch.push(nextTokenId);
          }
        } else {
          // No synchronization - dispatch immediately
          tokensToDispatch.push(nextTokenId);
        }
      }
    }

    // Check if workflow is complete (no pending or executing tokens remain)
    const activeCount = tokens.getActiveTokenCount(workflow_run_id);

    if (activeCount === 0) {
      // Extract final output using output_mapping
      const finalOutput: Record<string, unknown> = {};

      this.logger.info({
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

            // Check if this is a branch collection path (ends with ._branches)
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
          }
        }
      }

      this.logger.info({
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
}
