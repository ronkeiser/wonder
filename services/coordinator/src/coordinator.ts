import { createEmitter, type Emitter, type EventContext } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import * as context from './context';
import { renderTemplate } from './template';
import * as tokens from './tokens';

/**
 * WorkflowCoordinator Durable Object
 *
 * Minimal hello world implementation.
 * Will be rebuilt incrementally with full logging.
 */
export class WorkflowCoordinator extends DurableObject {
  private logger: Logger;
  private emitter: Emitter;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(this.ctx, this.env.LOGS, {
      service: 'coordinator',
      environment: 'production',
    });
    this.emitter = createEmitter(this.ctx, this.env.EVENTS);
  }

  /**
   * Dispatch a token for execution - prepares task and calls executor
   */
  private async dispatchToken(token_id: string): Promise<void> {
    // Fetch the token's node from the workflow definition
    const tokenRow = tokens.getToken(this.ctx.storage.sql, token_id);
    const workflow_run_id = tokenRow.workflow_run_id as string;

    // Fetch workflow definition
    using workflowRuns = this.env.RESOURCES.workflowRuns();
    const workflowRun = await workflowRuns.get(workflow_run_id);

    using workflowDefs = this.env.RESOURCES.workflowDefs();
    const workflowDef = await workflowDefs.get(
      workflowRun.workflow_run.workflow_def_id,
      workflowRun.workflow_run.workflow_version,
    );

    const node = workflowDef.nodes.find(
      (n: any) => n.id === tokenRow.node_id,
    );

    if (!node) {
      throw new Error(`Node not found: ${tokenRow.node_id}`);
    }

    this.logger.info({
      event_type: 'node_fetched',
      message: 'Node retrieved from workflow definition',
      trace_id: workflow_run_id,
      metadata: {
        node_id: node.id,
        node_name: node.name,
        action_id: node.action_id,
        action_version: node.action_version,
      },
    });

    // Fetch the action definition
    using actions = this.env.RESOURCES.actions();
    const actionResult = await actions.get(node.action_id, node.action_version);

    this.logger.info({
      event_type: 'action_fetched',
      message: 'Action definition retrieved',
      trace_id: workflow_run_id,
      metadata: {
        action_id: actionResult.action.id,
        action_name: actionResult.action.name,
        action_kind: actionResult.action.kind,
        action_version: actionResult.action.version,
      },
    });

    // Route to appropriate executor action based on kind
    let actionResult_output: Record<string, unknown>;

    switch (actionResult.action.kind) {
      case 'llm_call': {
        const implementation = actionResult.action.implementation as any;
        
        // Fetch prompt spec
        using promptSpecs = this.env.RESOURCES.promptSpecs();
        const promptSpecResult = await promptSpecs.get(implementation.prompt_spec_id);

        this.logger.info({
          event_type: 'prompt_spec_fetched',
          message: 'Prompt spec retrieved',
          trace_id: workflow_run_id,
          metadata: {
            prompt_spec_id: promptSpecResult.prompt_spec.id,
            prompt_spec_name: promptSpecResult.prompt_spec.name,
            template: promptSpecResult.prompt_spec.template,
          },
        });

        // Fetch model profile
        using modelProfiles = this.env.RESOURCES.modelProfiles();
        const modelProfileResult = await modelProfiles.get(implementation.model_profile_id);

        this.logger.info({
          event_type: 'model_profile_fetched',
          message: 'Model profile retrieved',
          trace_id: workflow_run_id,
          metadata: {
            model_profile_id: modelProfileResult.model_profile.id,
            model_profile_name: modelProfileResult.model_profile.name,
            model_id: modelProfileResult.model_profile.model_id,
            parameters: modelProfileResult.model_profile.parameters,
          },
        });

        // Evaluate input_mapping to build template context
        const templateContext: Record<string, unknown> = {};
        if (node.input_mapping) {
          for (const [varName, jsonPath] of Object.entries(node.input_mapping)) {
            // Simple JSONPath evaluation for $.input.* and $.nodeId_output.*
            const pathStr = jsonPath as string;
            if (pathStr.startsWith('$.')) {
              const contextPath = pathStr.slice(2); // Remove $.
              const value = context.getContextValue(this.ctx.storage.sql, contextPath);
              if (value !== undefined) {
                templateContext[varName] = value;
              }
            }
          }
        }

        this.logger.info({
          event_type: 'input_mapping_evaluated',
          message: 'Input mapping evaluated for prompt rendering',
          trace_id: workflow_run_id,
          metadata: {
            input_mapping: node.input_mapping,
            template_context: templateContext,
          },
        });

        // Render template with context
        const prompt = renderTemplate(promptSpecResult.prompt_spec.template, templateContext);

        // Mark token as executing
        tokens.updateTokenStatus(this.ctx.storage.sql, token_id, 'executing');

        // Build event context
        const eventContext: EventContext = {
          workflow_run_id,
          workspace_id: workflowRun.workflow_run.workspace_id,
          project_id: workflowRun.workflow_run.project_id,
          workflow_def_id: workflowRun.workflow_run.workflow_def_id,
          parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
        };

        // Emit node_started event
        this.emitter.emit(eventContext, {
          event_type: 'node_started',
          node_id: node.id,
          token_id,
          message: `Node ${node.name} started`,
        });

        this.logger.info({
          event_type: 'token_executing',
          message: 'Token status updated to executing',
          trace_id: workflow_run_id,
          metadata: {
            token_id,
            node_id: node.id,
            status: 'executing',
          },
        });

        // Fire-and-forget to executor - executor will callback to handleTaskResult
        this.ctx.waitUntil(
          this.env.EXECUTOR.llmCall({
            model_profile: modelProfileResult.model_profile,
            prompt,
            json_schema: promptSpecResult.prompt_spec.produces, // Pass output schema for structured output
            workflow_run_id,
            token_id,
          })
        );

        // Emit llm_call_started event
        this.emitter.emit(eventContext, {
          event_type: 'llm_call_started',
          node_id: node.id,
          token_id,
          message: `LLM call started: ${modelProfileResult.model_profile.model_id}`,
          metadata: {
            model_id: modelProfileResult.model_profile.model_id,
            provider: modelProfileResult.model_profile.provider,
          },
        });

        this.logger.info({
          event_type: 'task_dispatched',
          message: 'Task dispatched to executor',
          trace_id: workflow_run_id,
          metadata: {
            token_id,
            node_id: node.id,
            action_kind: actionResult.action.kind,
            model_id: modelProfileResult.model_profile.model_id,
            provider: modelProfileResult.model_profile.provider,
            model_parameters: modelProfileResult.model_profile.parameters,
          },
        });

        return; // Don't wait - executor will callback
      }

      default:
        throw new Error(`Unsupported action kind: ${actionResult.action.kind}`);
    }
  }

  /**
   * Handle task result from executor - applies output and advances tokens (RPC method)
   */
  async handleTaskResult(
    token_id: string,
    result: { output_data: Record<string, unknown> }
  ): Promise<void> {
    // Fetch token info
    const tokenRow = tokens.getToken(this.ctx.storage.sql, token_id);
    const workflow_run_id = tokenRow.workflow_run_id as string;
    const node_id = tokenRow.node_id as string;

    // Update token status to completed
    tokens.updateTokenStatus(this.ctx.storage.sql, token_id, 'completed');

    this.logger.info({
      event_type: 'token_completed',
      message: 'Token status updated to completed',
      trace_id: workflow_run_id,
      metadata: {
        token_id,
        node_id,
        status: 'completed',
      },
    });

    // Get node ref for context path (refs are stable identifiers used in input_mapping)
    using workflowRuns = this.env.RESOURCES.workflowRuns();
    const workflowRun = await workflowRuns.get(workflow_run_id);

    using workflowDefs = this.env.RESOURCES.workflowDefs();
    const workflowDef = await workflowDefs.get(
      workflowRun.workflow_run.workflow_def_id,
      workflowRun.workflow_run.workflow_version,
    );

    const node = workflowDef.nodes.find((n: any) => n.id === node_id);
    if (!node) {
      throw new Error(`Node not found: ${node_id}`);
    }

    // Apply node's output_mapping to transform action output keys
    const mappedOutput: Record<string, unknown> = {};
    if (node.output_mapping) {
      for (const [outputKey, jsonPath] of Object.entries(node.output_mapping)) {
        const pathStr = jsonPath as string;
        if (pathStr.startsWith('$.')) {
          const sourcePath = pathStr.slice(2); // Remove $.
          // Navigate nested paths (e.g., "response.template")
          const pathParts = sourcePath.split('.');
          let value: any = result.output_data;
          for (const part of pathParts) {
            if (value && typeof value === 'object' && part in value) {
              value = value[part];
            } else {
              value = undefined;
              break;
            }
          }
          if (value !== undefined) {
            mappedOutput[outputKey] = value;
          }
        }
      }
    } else {
      // If no output_mapping, use raw output
      Object.assign(mappedOutput, result.output_data);
    }

    // Store mapped output in context using node.ref (matches input_mapping paths)
    context.setNodeOutput(this.ctx.storage.sql, node.ref, mappedOutput);

    // Build event context
    const eventContext: EventContext = {
      workflow_run_id,
      workspace_id: workflowRun.workflow_run.workspace_id,
      project_id: workflowRun.workflow_run.project_id,
      workflow_def_id: workflowRun.workflow_run.workflow_def_id,
      parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
    };

    // Emit node_completed event
    this.emitter.emit(eventContext, {
      event_type: 'node_completed',
      node_id,
      token_id,
      message: `Node ${node.name} completed`,
    });

    // Emit context_updated event
    this.emitter.emit(eventContext, {
      event_type: 'context_updated',
      node_id,
      token_id,
      message: `Context updated with output from ${node.ref}`,
      metadata: { output_keys: Object.keys(mappedOutput) },
    });

    this.logger.info({
      event_type: 'context_output_stored',
      message: 'Action output stored in context',
      trace_id: workflow_run_id,
      metadata: {
        token_id,
        node_id,
        node_ref: node.ref,
        raw_output_keys: Object.keys(result.output_data),
        mapped_output_keys: Object.keys(mappedOutput),
        output_mapping: node.output_mapping,
        context_paths: Object.keys(mappedOutput).map(key => `${node.ref}_output.${key}`),
      },
    });

    // Query for transitions from completed node
    const transitions = workflowDef.transitions.filter(
      (t: any) => t.from_node_id === node_id
    );

    this.logger.info({
      event_type: 'transitions_queried',
      message: 'Transitions queried for completed node',
      trace_id: workflow_run_id,
      metadata: {
        token_id,
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

    // Create tokens for all outgoing transitions
    for (const transition of transitions) {
      const nextTokenId = tokens.createToken(this.ctx.storage.sql, {
        workflow_run_id,
        node_id: transition.to_node_id,
        parent_token_id: token_id, // current completed token
        path_id: '', // same as parent for now
        fan_out_transition_id: null, // null for simple linear flow
        branch_index: 0, // 0 for single branch
        branch_total: 1, // 1 for single branch
      });

      // Emit token_spawned event
      this.emitter.emit(eventContext, {
        event_type: 'token_spawned',
        node_id: transition.to_node_id,
        token_id: nextTokenId,
        message: `Token spawned for transition to node`,
        metadata: {
          parent_token_id: token_id,
          transition_id: transition.id,
        },
      });

      this.logger.info({
        event_type: 'transition_token_created',
        message: 'Token created for transition target node',
        trace_id: workflow_run_id,
        metadata: {
          parent_token_id: token_id,
          new_token_id: nextTokenId,
          transition_id: transition.id,
          from_node_id: transition.from_node_id,
          to_node_id: transition.to_node_id,
        },
      });

      // Dispatch the newly created token
      await this.dispatchToken(nextTokenId);
    }

    // Check if workflow is complete (no pending or executing tokens remain)
    const activeCount = tokens.getActiveTokenCount(this.ctx.storage.sql, workflow_run_id);

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
            const value = context.getContextValue(this.ctx.storage.sql, contextPath);
            if (value !== undefined) {
              finalOutput[key] = value;
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
      this.emitter.emit(eventContext, {
        event_type: 'workflow_completed',
        message: 'Workflow execution completed',
        metadata: { final_output: finalOutput },
      });

      // Store final output with workflow_run in Resources service
      using workflowRunsService = this.env.RESOURCES.workflowRuns();
      await workflowRunsService.complete(workflow_run_id, finalOutput);
    }
  }

  /**
   * Start workflow execution (RPC method)
   */
  async start(workflow_run_id: string, input: Record<string, unknown>): Promise<void> {
    let token_id: string | undefined;

    try {
      this.logger.info({
        event_type: 'coordinator_start_called',
        message: 'Coordinator.start() called',
        trace_id: workflow_run_id,
        highlight: 'cyan',
        metadata: {
          workflow_run_id,
          input,
          durable_object_id: this.ctx.id.toString(),
        },
      });

      // Step 1: Fetch workflow run metadata from Resources service
      using workflowRuns = this.env.RESOURCES.workflowRuns();
      const workflowRun = await workflowRuns.get(workflow_run_id);

      this.logger.info({
        event_type: 'workflow_run_fetched',
        message: 'Workflow run metadata retrieved',
        trace_id: workflow_run_id,
        metadata: {
          workflow_run_id: workflowRun.workflow_run.id,
          workflow_def_id: workflowRun.workflow_run.workflow_def_id,
          workflow_version: workflowRun.workflow_run.workflow_version,
          workspace_id: workflowRun.workflow_run.workspace_id,
          project_id: workflowRun.workflow_run.project_id,
          parent_run_id: workflowRun.workflow_run.parent_run_id,
        },
      });

      // Step 2: Fetch WorkflowDef to get initial node and schema
      using workflowDefs = this.env.RESOURCES.workflowDefs();
      const workflowDef = await workflowDefs.get(
        workflowRun.workflow_run.workflow_def_id,
        workflowRun.workflow_run.workflow_version,
      );

      this.logger.info({
        event_type: 'workflow_def_fetched',
        message: 'Workflow definition retrieved',
        trace_id: workflow_run_id,
        metadata: {
          workflow_def_id: workflowDef.workflow_def.id,
          workflow_def_name: workflowDef.workflow_def.name,
          workflow_version: workflowDef.workflow_def.version,
          initial_node_id: workflowDef.workflow_def.initial_node_id,
          has_context_schema: !!workflowDef.workflow_def.context_schema,
        },
      });

      // Build event context for workflow events
      const eventContext: EventContext = {
        workflow_run_id,
        workspace_id: workflowRun.workflow_run.workspace_id,
        project_id: workflowRun.workflow_run.project_id,
        workflow_def_id: workflowRun.workflow_run.workflow_def_id,
        parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
      };

      // Emit workflow_started event
      this.emitter.emit(eventContext, {
        event_type: 'workflow_started',
        message: `Workflow ${workflowDef.workflow_def.name} started`,
        metadata: { input },
      });

      // Step 3: Create context table in SQLite
      context.initializeContextTable(this.ctx.storage.sql);

      this.logger.info({
        event_type: 'context_table_created',
        message: 'Context table created successfully',
        trace_id: workflow_run_id,
        metadata: { workflow_run_id },
      });

      // Step 4: Initialize context with workflow input
      context.initializeContextWithInput(this.ctx.storage.sql, input);

      this.logger.info({
        event_type: 'context_initialized',
        message: 'Context initialized with workflow input',
        trace_id: workflow_run_id,
        metadata: {
          workflow_run_id,
          input_keys: Object.keys(input),
        },
      });

      // Step 5: Create tokens table in SQLite
      tokens.initializeTokensTable(this.ctx.storage.sql);

      this.logger.info({
        event_type: 'tokens_table_created',
        message: 'Tokens table created successfully',
        trace_id: workflow_run_id,
        metadata: { workflow_run_id },
      });

      // Step 6: Create and insert initial token
      if (!workflowDef.workflow_def.initial_node_id) {
        throw new Error('Workflow definition has no initial_node_id');
      }
      
      token_id = tokens.createToken(this.ctx.storage.sql, {
        workflow_run_id,
        node_id: workflowDef.workflow_def.initial_node_id,
        parent_token_id: null, // null for initial token
        path_id: 'root', // 'root' for initial token per branching doc
        fan_out_transition_id: null, // null for initial token
        branch_index: 0, // 0 for single branch
        branch_total: 1, // 1 for single branch
      });

      this.logger.info({
        event_type: 'initial_token_created',
        message: 'Initial token created and inserted',
        trace_id: workflow_run_id,
        metadata: {
          token_id,
          workflow_run_id,
          node_id: workflowDef.workflow_def.initial_node_id,
          status: 'pending',
          path_id: '',
        },
      });

      // Step 7: Dispatch the initial token for execution
      await this.dispatchToken(token_id);

      this.logger.info({
        event_type: 'coordinator_start_completed',
        message: 'Coordinator.start() completed',
        trace_id: workflow_run_id,
        metadata: { workflow_run_id },
      });
    } catch (error) {
      this.logger.error({
        event_type: 'coordinator_start_failed',
        message: 'Coordinator.start() failed with error',
        trace_id: workflow_run_id,
        metadata: {
          workflow_run_id,
          token_id,
          error: error instanceof Error ? error.message : String(error),
          error_stack: error instanceof Error ? error.stack : undefined,
        },
      });

      // Emit workflow_failed event (need to build context without workflowRun if it failed early)
      this.emitter.emit(
        {
          workflow_run_id,
          workspace_id: '', // May not have this if fetch failed
          project_id: '',
        },
        {
          event_type: 'workflow_failed',
          token_id,
          message: error instanceof Error ? error.message : String(error),
        },
      );

      // Update token status to failed if token was created
      if (token_id) {
        try {
          tokens.updateTokenStatus(this.ctx.storage.sql, token_id, 'failed');

          this.logger.info({
            event_type: 'token_failed',
            message: 'Token status updated to failed',
            trace_id: workflow_run_id,
            metadata: {
              token_id,
              status: 'failed',
            },
          });
        } catch (updateError) {
          this.logger.error({
            event_type: 'token_update_failed',
            message: 'Failed to update token status to failed',
            trace_id: workflow_run_id,
            metadata: {
              token_id,
              error: updateError instanceof Error ? updateError.message : String(updateError),
            },
          });
        }
      }

      // Re-throw to propagate error to caller
      throw error;
    }
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    this.logger.info({
      event_type: 'alarm_triggered',
      message: 'Durable Object alarm triggered',
      metadata: { durable_object_id: this.ctx.id.toString() },
    });
  }
}
