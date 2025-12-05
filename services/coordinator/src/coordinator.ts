import { createEmitter, type Emitter, type EventContext } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import * as artifacts from './artifacts';
import * as context from './context';
import * as routing from './routing';
import * as tasks from './tasks';
import * as tokens from './tokens';

/**
 * WorkflowCoordinator Durable Object
 *
 * Thin orchestration layer that wires services together.
 * Business logic lives in routing.ts and tasks.ts services.
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
   * Dispatch a token for execution - delegates to tasks service
   */
  private async dispatchToken(token_id: string): Promise<void> {
    const tokenRow = tokens.getToken(this.ctx.storage.sql, token_id);
    const workflow_run_id = tokenRow.workflow_run_id as string;

    // Mark token as executing
    tokens.updateTokenStatus(this.ctx.storage.sql, token_id, 'executing');

    // Delegate to tasks service to build and dispatch payload
    await tasks.buildPayload({
      token_id,
      node_id: tokenRow.node_id as string,
      workflow_run_id,
      sql: this.ctx.storage.sql,
      env: this.env,
      logger: this.logger,
      emitter: this.emitter,
    });
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

    // Delegate to routing service to decide what happens next
    const decision = await routing.decide({
      completed_token_id: token_id,
      workflow_run_id,
      sql: this.ctx.storage.sql,
      env: this.env,
      logger: this.logger,
      emitter: this.emitter,
    });

    // Dispatch all tokens from routing decision
    for (const nextTokenId of decision.tokensToDispatch) {
      await this.dispatchToken(nextTokenId);
    }

    // If workflow is complete, finalize
    if (decision.workflowComplete) {
      // Commit any staged artifacts
      await artifacts.commitArtifacts(this.env, this.ctx.storage.sql);

      // Store final output with workflow_run in Resources service
      using workflowRunsService = this.env.RESOURCES.workflowRuns();
      await workflowRunsService.complete(workflow_run_id, decision.finalOutput || {});
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

      // Fetch workflow run metadata and definition
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

      // Initialize storage tables
      context.initializeContextTable(this.ctx.storage.sql);
      tokens.initializeTokensTable(this.ctx.storage.sql);
      artifacts.initializeArtifactsTable(this.ctx.storage.sql);

      this.logger.info({
        event_type: 'storage_initialized',
        message: 'Storage tables created successfully',
        trace_id: workflow_run_id,
        metadata: { workflow_run_id },
      });

      // Initialize context with workflow input
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

      // Create initial token
      if (!workflowDef.workflow_def.initial_node_id) {
        throw new Error('Workflow definition has no initial_node_id');
      }
      
      token_id = tokens.createToken(this.ctx.storage.sql, {
        workflow_run_id,
        node_id: workflowDef.workflow_def.initial_node_id,
        parent_token_id: null,
        path_id: 'root',
        fan_out_transition_id: null,
        branch_index: 0,
        branch_total: 1,
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
          path_id: 'root',
        },
      });

      // Dispatch the initial token
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

      // Emit workflow_failed event
      this.emitter.emit(
        {
          workflow_run_id,
          workspace_id: '',
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
