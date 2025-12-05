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

    this.logger.info({
      event_type: 'ROUTER_DECIDE_START',
      message: 'Router.decide() called',
      trace_id: workflow_run_id,
      metadata: {
        completed_token_id,
        workflow_run_id,
      },
    });

    // Get completed token info
    const tokenRow = tokens.getToken(completed_token_id);
    const node_id = tokenRow.node_id as string;

    this.logger.info({
      event_type: 'ROUTER_TOKEN_INFO',
      message: 'Retrieved completed token info',
      trace_id: workflow_run_id,
      metadata: {
        completed_token_id,
        node_id,
        path_id: tokenRow.path_id,
        fan_out_transition_id: tokenRow.fan_out_transition_id,
        branch_index: tokenRow.branch_index,
        branch_total: tokenRow.branch_total,
        status: tokenRow.status,
      },
    });

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
      this.logger.error({
        event_type: 'ROUTER_NODE_NOT_FOUND',
        message: `Node not found: ${node_id}`,
        trace_id: workflow_run_id,
        metadata: {
          node_id,
          available_nodes: workflowDef.nodes.map((n: any) => n.id),
        },
      });
      throw new Error(`Node not found: ${node_id}`);
    }

    this.logger.info({
      event_type: 'ROUTER_NODE_FOUND',
      message: 'Found completed node in workflow def',
      trace_id: workflow_run_id,
      metadata: {
        node_id,
        node_ref: node.ref,
        node_name: node.name,
      },
    });

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

    this.logger.info({
      event_type: 'ROUTER_TRANSITION_LOOP_START',
      message: `Processing ${transitions.length} transition(s)`,
      trace_id: workflow_run_id,
      metadata: {
        completed_token_id,
        transition_count: transitions.length,
        transition_ids: transitions.map((t: any) => t.id),
      },
    });

    for (const transition of transitions) {
      this.logger.info({
        event_type: 'ROUTER_TRANSITION_START',
        message: 'Processing transition',
        trace_id: workflow_run_id,
        metadata: {
          transition_id: transition.id,
          transition_ref: transition.ref,
          from_node_id: transition.from_node_id,
          to_node_id: transition.to_node_id,
          has_synchronization: !!transition.synchronization,
          spawn_count: transition.spawn_count,
        },
      });

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
      this.logger.info({
        event_type: 'ROUTER_SYNC_CHECK',
        message: 'Checking if transition has synchronization',
        trace_id: workflow_run_id,
        metadata: {
          transition_id: transition.id,
          has_synchronization: !!transition.synchronization,
        },
      });

      if (transition.synchronization) {
        this.logger.info({
          event_type: 'ROUTER_SYNC_FOUND',
          message: 'Transition has synchronization config',
          trace_id: workflow_run_id,
          metadata: {
            transition_id: transition.id,
            synchronization: transition.synchronization,
          },
        });

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
              available_transitions: workflowDef.transitions.map((t: any) => ({
                id: t.id,
                ref: t.ref,
              })),
            },
          });
          continue;
        }

        this.logger.info({
          event_type: 'ROUTER_JOINS_RESOLVED',
          message: 'Resolved joins_transition ref to ID',
          trace_id: workflow_run_id,
          metadata: {
            joins_transition_ref: joinsTransitionRef,
            joins_transition_id: joinsTransition.id,
          },
        });

        const joinsTransitionId = joinsTransition.id;

        // Verify the COMPLETED token belongs to the sibling group being joined
        this.logger.info({
          event_type: 'ROUTER_SIBLING_CHECK',
          message: 'Checking if completed token belongs to sibling group',
          trace_id: workflow_run_id,
          metadata: {
            completed_token_fan_out_id: tokenRow.fan_out_transition_id,
            joins_transition_id: joinsTransitionId,
            is_sibling: tokenRow.fan_out_transition_id === joinsTransitionId,
          },
        });

        if (tokenRow.fan_out_transition_id === joinsTransitionId) {
          this.logger.info({
            event_type: 'ROUTER_IS_SIBLING',
            message: 'Completed token IS part of sibling group - applying synchronization',
            trace_id: workflow_run_id,
            metadata: {
              completed_token_id,
              joins_transition_id: joinsTransitionId,
            },
          });
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

            this.logger.info({
              event_type: 'ROUTER_SIBLINGS_RETRIEVED',
              message: 'Retrieved all sibling tokens',
              trace_id: workflow_run_id,
              metadata: {
                completed_token_id,
                joins_transition_id: joinsTransitionId,
                sibling_count: siblings.length,
                siblings: siblings.map((s) => ({
                  id: s.id,
                  status: s.status,
                  path_id: s.path_id,
                })),
              },
            });

            const terminalStates = ['completed', 'failed', 'timed_out', 'cancelled'];
            const finishedSiblings = siblings.filter((s) =>
              terminalStates.includes(s.status as string),
            );

            this.logger.info({
              event_type: 'ROUTER_FINISHED_COUNT',
              message: 'Counted finished siblings',
              trace_id: workflow_run_id,
              metadata: {
                completed_token_id,
                finished_count: finishedSiblings.length,
                total_count: siblings.length,
                finished_ids: finishedSiblings.map((s) => s.id),
                wait_for: syncConfig.wait_for,
              },
            });

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
              this.logger.info({
                event_type: 'ROUTER_ACTIVATING_WAITING',
                message: 'Condition met - activating waiting token',
                trace_id: workflow_run_id,
                metadata: {
                  completed_token_id,
                  waiting_token_id: existingFanInTokens[0].id,
                },
              });
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
                this.logger.info({
                  event_type: 'ROUTER_MERGE_START',
                  message: 'Starting branch merge',
                  trace_id: workflow_run_id,
                  metadata: {
                    merge_config: syncConfig.merge,
                    node_ref: node.ref,
                  },
                });

                const mergeConfig = syncConfig.merge;
                const nodeRefForMerge = node.ref;
                const branchOutputs = context.getBranchOutputs(sql, nodeRefForMerge);

                this.logger.info({
                  event_type: 'ROUTER_BRANCH_OUTPUTS_RETRIEVED',
                  message: 'Retrieved branch outputs for merge',
                  trace_id: workflow_run_id,
                  metadata: {
                    node_ref: nodeRefForMerge,
                    branch_count: branchOutputs.length,
                    branch_outputs: branchOutputs,
                  },
                });

                let mergedData: unknown;
                if (mergeConfig.source === '*') {
                  mergedData = branchOutputs;
                  this.logger.info({
                    event_type: 'ROUTER_MERGE_STRATEGY_FULL',
                    message: 'Using full branch outputs (source=*)',
                    trace_id: workflow_run_id,
                    metadata: { merged_count: branchOutputs.length },
                  });
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
                    message: `Extracted field from each branch output`,
                    trace_id: workflow_run_id,
                    metadata: {
                      source_pattern: mergeConfig.source,
                      field_path: fieldPath,
                      extracted_values: mergedData,
                    },
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
                    node_ref: nodeRefForMerge,
                    target_path: targetPath,
                    branch_count: branchOutputs.length,
                    source_pattern: mergeConfig.source,
                    merged_data: mergedData,
                  },
                });
              }

              // Activate and dispatch
              this.logger.info({
                event_type: 'ROUTER_ACTIVATING_TOKEN',
                message: 'Updating token status to pending and adding to dispatch queue',
                trace_id: workflow_run_id,
                metadata: {
                  token_id: waitingToken.id,
                  from_status: waitingToken.status,
                  to_status: 'pending',
                },
              });

              tokens.updateTokenStatus(waitingToken.id as string, 'pending');
              tokensToDispatch.push(waitingToken.id as string);

              this.logger.info({
                event_type: 'ROUTER_TOKEN_DISPATCHED',
                message: 'Token added to dispatch queue',
                trace_id: workflow_run_id,
                metadata: {
                  token_id: waitingToken.id,
                  dispatch_queue_size: tokensToDispatch.length,
                },
              });
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
      this.logger.info({
        event_type: 'ROUTER_TOKEN_CREATION_LOOP_START',
        message: `Starting token creation loop (spawn_count=${spawnCount})`,
        trace_id: workflow_run_id,
        metadata: {
          transition_id: transition.id,
          spawn_count: spawnCount,
          parent_token_id: completed_token_id,
          parent_path_id: tokenRow.path_id,
        },
      });

      for (let i = 0; i < spawnCount; i++) {
        // Build path_id: parent_path.nodeRef.branchIndex
        // Example: root.hello_node.0, root.hello_node.1, root.hello_node.2
        const newPathId = `${tokenRow.path_id}.${completedNodeRef}.${i}`;

        this.logger.info({
          event_type: 'ROUTER_TOKEN_CREATING',
          message: `Creating token ${i + 1}/${spawnCount}`,
          trace_id: workflow_run_id,
          metadata: {
            transition_id: transition.id,
            to_node_id: transition.to_node_id,
            new_path_id: newPathId,
            branch_index: i,
            branch_total: spawnCount,
          },
        });

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
    this.logger.info({
      event_type: 'ROUTER_CHECKING_COMPLETION',
      message: 'Checking if workflow is complete',
      trace_id: workflow_run_id,
      metadata: {
        completed_token_id,
        tokens_to_dispatch_count: tokensToDispatch.length,
      },
    });

    const activeCount = tokens.getActiveTokenCount(workflow_run_id);

    this.logger.info({
      event_type: 'ROUTER_ACTIVE_COUNT',
      message: 'Retrieved active token count',
      trace_id: workflow_run_id,
      metadata: {
        active_count: activeCount,
        is_complete: activeCount === 0,
      },
    });

    if (activeCount === 0) {
      this.logger.info({
        event_type: 'ROUTER_WORKFLOW_COMPLETE',
        message: 'No active tokens remaining - workflow is complete',
        trace_id: workflow_run_id,
        metadata: {
          active_count: activeCount,
        },
      });

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
        this.logger.info({
          event_type: 'ROUTER_OUTPUT_MAPPING_START',
          message: 'Processing output mapping entries',
          trace_id: workflow_run_id,
          metadata: {
            output_mapping: workflowDef.workflow_def.output_mapping,
            entry_count: Object.keys(workflowDef.workflow_def.output_mapping).length,
          },
        });

        for (const [key, jsonPath] of Object.entries(workflowDef.workflow_def.output_mapping)) {
          const pathStr = jsonPath as string;

          this.logger.info({
            event_type: 'ROUTER_OUTPUT_ENTRY',
            message: `Processing output mapping entry: ${key}`,
            trace_id: workflow_run_id,
            metadata: {
              output_key: key,
              json_path: pathStr,
            },
          });

          if (pathStr.startsWith('$.')) {
            const contextPath = pathStr.slice(2); // Remove $.

            // Check if this is a branch collection path (ends with ._branches)
            if (contextPath.endsWith('._branches')) {
              const nodeRef = contextPath.replace('_output._branches', '');
              const branchOutputs = context.getBranchOutputs(sql, nodeRef);

              this.logger.info({
                event_type: 'ROUTER_OUTPUT_BRANCHES',
                message: 'Retrieved branch outputs for output mapping',
                trace_id: workflow_run_id,
                metadata: {
                  output_key: key,
                  node_ref: nodeRef,
                  branch_count: branchOutputs.length,
                  branch_outputs: branchOutputs,
                },
              });

              if (branchOutputs.length > 0) {
                finalOutput[key] = branchOutputs;
              }
            } else {
              const value = context.getContextValue(sql, contextPath);

              this.logger.info({
                event_type: 'ROUTER_OUTPUT_CONTEXT',
                message: 'Retrieved context value for output mapping',
                trace_id: workflow_run_id,
                metadata: {
                  output_key: key,
                  context_path: contextPath,
                  value,
                  has_value: value !== undefined,
                },
              });

              if (value !== undefined) {
                finalOutput[key] = value;
              }
            }
          }
        }

        this.logger.info({
          event_type: 'ROUTER_OUTPUT_COMPLETE',
          message: 'Finished processing output mapping',
          trace_id: workflow_run_id,
          metadata: {
            final_output: finalOutput,
            output_keys: Object.keys(finalOutput),
          },
        });
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
    } else {
      this.logger.info({
        event_type: 'ROUTER_WORKFLOW_CONTINUING',
        message: 'Workflow continuing - active tokens remain',
        trace_id: workflow_run_id,
        metadata: {
          active_count: activeCount,
          tokens_to_dispatch: tokensToDispatch.length,
        },
      });
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
}
