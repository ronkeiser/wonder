import type { Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';
import { ulid } from 'ulid';

/**
 * WorkflowCoordinator Durable Object
 *
 * Minimal hello world implementation.
 * Will be rebuilt incrementally with full logging.
 */
export class WorkflowCoordinator extends DurableObject {
  private logger: Logger | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /**
   * Get or create logger instance
   */
  private getLogger(): Logger {
    if (!this.logger) {
      this.logger = this.env.LOGS.newLogger({
        service: 'wonder-coordinator',
        environment: 'production',
        instance_id: this.ctx.id.toString(),
      });
    }
    return this.logger;
  }

  /**
   * Start workflow execution (RPC method)
   */
  async start(workflow_run_id: string, input: Record<string, unknown>): Promise<void> {
    const logger = this.getLogger();

    logger.info({
      event_type: 'coordinator_start_called',
      message: 'Coordinator.start() called',
      trace_id: workflow_run_id,
      metadata: {
        workflow_run_id,
        input,
        durable_object_id: this.ctx.id.toString(),
      },
    });

    // Step 1: Fetch workflow run metadata from Resources service
    using workflowRuns = this.env.RESOURCES.workflowRuns();
    const workflowRun = await workflowRuns.get(workflow_run_id);

    logger.info({
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

    logger.info({
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

    // Step 3: Create tokens table in SQLite
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        workflow_run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL,
        path_id TEXT NOT NULL,
        parent_token_id TEXT,
        fan_out_node_id TEXT,
        branch_index INTEGER NOT NULL,
        branch_total INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    logger.info({
      event_type: 'tokens_table_created',
      message: 'Tokens table created successfully',
      trace_id: workflow_run_id,
      metadata: { workflow_run_id },
    });

    // Step 4: Create and insert initial token
    const token_id = ulid();
    const now = new Date().toISOString();

    this.ctx.storage.sql.exec(
      `INSERT INTO tokens (
        id, workflow_run_id, node_id, status, path_id,
        parent_token_id, fan_out_node_id, branch_index, branch_total,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      token_id,
      workflow_run_id,
      workflowDef.workflow_def.initial_node_id,
      'pending',
      '', // path_id: empty string for root
      null, // parent_token_id: null for initial token
      null, // fan_out_node_id: null for initial token
      0, // branch_index: 0 for single branch
      1, // branch_total: 1 for single branch
      now, // created_at
      now, // updated_at
    );

    logger.info({
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

    // Step 5: Fetch the initial node from the workflow definition
    const initialNode = workflowDef.nodes.find(
      (node: any) => node.id === workflowDef.workflow_def.initial_node_id,
    );

    if (!initialNode) {
      throw new Error(
        `Initial node not found: ${workflowDef.workflow_def.initial_node_id}`,
      );
    }

    logger.info({
      event_type: 'initial_node_fetched',
      message: 'Initial node retrieved from workflow definition',
      trace_id: workflow_run_id,
      metadata: {
        node_id: initialNode.id,
        node_name: initialNode.name,
        action_id: initialNode.action_id,
        action_version: initialNode.action_version,
      },
    });

    // Step 6: Fetch the action definition
    using actions = this.env.RESOURCES.actions();
    const actionResult = await actions.get(initialNode.action_id, initialNode.action_version);

    logger.info({
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

    // Step 7: Create context table in SQLite
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS context (
        path TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    logger.info({
      event_type: 'context_table_created',
      message: 'Context table created successfully',
      trace_id: workflow_run_id,
      metadata: { workflow_run_id },
    });

    // Step 8: Initialize context with workflow input
    for (const [key, value] of Object.entries(input)) {
      this.ctx.storage.sql.exec(
        `INSERT INTO context (path, value) VALUES (?, ?)`,
        `input.${key}`,
        JSON.stringify(value),
      );
    }

    logger.info({
      event_type: 'context_initialized',
      message: 'Context initialized with workflow input',
      trace_id: workflow_run_id,
      metadata: {
        workflow_run_id,
        input_keys: Object.keys(input),
      },
    });

    // Step 9: Route to appropriate executor action based on kind
    let actionResult_output: Record<string, unknown>;

    switch (actionResult.action.kind) {
      case 'llm_call': {
        const implementation = actionResult.action.implementation as any;
        const prompt = `You are a friendly assistant. User said: "${
          input.name || 'Hello'
        }". Respond in a warm, welcoming way.`;

        const result = await this.env.EXECUTOR.llmCall({
          model: implementation.model || '@cf/meta/llama-3.1-8b-instruct',
          prompt,
          temperature: implementation.temperature,
        });

        actionResult_output = { response: result.response };
        break;
      }

      default:
        throw new Error(`Unsupported action kind: ${actionResult.action.kind}`);
    }

    logger.info({
      event_type: 'action_executed',
      message: 'Action executed by executor service',
      trace_id: workflow_run_id,
      metadata: {
        token_id,
        node_id: initialNode.id,
        action_kind: actionResult.action.kind,
        output_data: actionResult_output,
      },
    });

    // Step 10: Update token status to completed
    const completedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE tokens SET status = ?, updated_at = ? WHERE id = ?`,
      'completed',
      completedAt,
      token_id,
    );

    logger.info({
      event_type: 'token_completed',
      message: 'Token status updated to completed',
      trace_id: workflow_run_id,
      metadata: {
        token_id,
        node_id: initialNode.id,
        status: 'completed',
        updated_at: completedAt,
      },
    });

    // Step 11: Store action output in context
    for (const [key, value] of Object.entries(actionResult_output)) {
      const contextPath = `${initialNode.id}_output.${key}`;
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO context (path, value) VALUES (?, ?)`,
        contextPath,
        JSON.stringify(value),
      );
    }

    logger.info({
      event_type: 'context_output_stored',
      message: 'Action output stored in context',
      trace_id: workflow_run_id,
      metadata: {
        token_id,
        node_id: initialNode.id,
        output_keys: Object.keys(actionResult_output),
        context_paths: Object.keys(actionResult_output).map(key => `${initialNode.id}_output.${key}`),
      },
    });

    logger.info({
      event_type: 'coordinator_start_completed',
      message: 'Coordinator.start() completed',
      trace_id: workflow_run_id,
      metadata: { workflow_run_id },
    });
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    const logger = this.getLogger();
    logger.info({
      event_type: 'alarm_triggered',
      message: 'Durable Object alarm triggered',
      metadata: { durable_object_id: this.ctx.id.toString() },
    });
  }
}
