import { createEmitter, type Emitter, type EventContext } from '@wonder/events';
import { createLogger, type Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import * as artifacts from './artifacts';
import * as context from './context';
import * as mapping from './mapping';
import { Router } from './router';
import { TaskManager } from './tasks';
import { TokenManager } from './tokens';

/**
 * WorkflowCoordinator Durable Object
 *
 * Thin orchestration layer that wires services together.
 * Business logic lives in routing.ts and tasks.ts services.
 */
export class WorkflowCoordinator extends DurableObject {
  private logger: Logger;
  private emitter: Emitter;
  private tokens: TokenManager;
  private router: Router;
  private tasks: TaskManager;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(this.ctx, this.env.LOGS, {
      service: 'coordinator',
      environment: 'production',
    });
    this.emitter = createEmitter(this.ctx, this.env.EVENTS);
    this.tokens = new TokenManager(this.ctx.storage.sql, this.logger);
    this.router = new Router(this.logger);
    this.tasks = new TaskManager(this.logger);
  }

  /**
   * Dispatch a token for execution - delegates to tasks service
   */
  private async dispatchToken(token_id: string): Promise<void> {
    const tokenRow = this.tokens.getToken(token_id);
    const workflow_run_id = tokenRow.workflow_run_id as string;

    // Mark token as executing
    this.tokens.updateTokenStatus(token_id, 'executing');

    // Delegate to tasks service to build and dispatch payload
    const result = await this.tasks.buildPayload({
      token_id,
      node_id: tokenRow.node_id as string,
      workflow_run_id,
      sql: this.ctx.storage.sql,
      env: this.env,
      emitter: this.emitter,
    });

    // If the task completed synchronously (node without action), handle it immediately
    if (result.completedSynchronously) {
      await this.handleTaskResult(token_id, { output_data: result.output_data ?? {} });
    }
    // Otherwise, the executor will callback asynchronously
  }

  /**
   * Handle task result from executor - applies output and advances tokens (RPC method)
   */
  async handleTaskResult(
    token_id: string,
    result: { output_data: Record<string, unknown> },
  ): Promise<void> {
    // Fetch token info
    const tokenRow = this.tokens.getToken(token_id);
    const workflow_run_id = tokenRow.workflow_run_id as string;
    const node_id = tokenRow.node_id as string;

    // Update token status to completed
    this.tokens.updateTokenStatus(token_id, 'completed');

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
    const mappedOutput = mapping.evaluateOutputMapping(node.output_mapping, result.output_data);

    // Store mapped output in context using node.ref (matches input_mapping paths)
    // Pass token_id to track branch outputs
    context.setNodeOutput(this.ctx.storage.sql, node.ref, mappedOutput, token_id);

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

    // Delegate to router to decide what happens next
    const decision = await this.router.decide({
      completed_token_id: token_id,
      workflow_run_id,
      tokens: this.tokens,
      sql: this.ctx.storage.sql,
      env: this.env,
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

    // Fetch workflow run metadata and definition
    using workflowRuns = this.env.RESOURCES.workflowRuns();
    const workflowRun = await workflowRuns.get(workflow_run_id);

    using workflowDefs = this.env.RESOURCES.workflowDefs();
    const workflowDef = await workflowDefs.get(
      workflowRun.workflow_run.workflow_def_id,
      workflowRun.workflow_run.workflow_version,
    );

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
    this.tokens.initializeTable();
    artifacts.initializeArtifactsTable(this.ctx.storage.sql);

    // Initialize context with workflow input
    context.initializeContextWithInput(this.ctx.storage.sql, input);

    // Create initial token
    if (!workflowDef.workflow_def.initial_node_id) {
      throw new Error('Workflow definition has no initial_node_id');
    }

    token_id = this.tokens.createToken({
      workflow_run_id,
      node_id: workflowDef.workflow_def.initial_node_id,
      parent_token_id: null,
      path_id: 'root',
      fan_out_transition_id: null,
      branch_index: 0,
      branch_total: 1,
    });

    // Dispatch the initial token
    await this.dispatchToken(token_id);
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    // Alarm triggered
  }
}
