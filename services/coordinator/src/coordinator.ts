import type { Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';

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
    logger.info({
      event_type: 'fetching_workflow_run',
      message: 'Fetching workflow run metadata',
      trace_id: workflow_run_id,
      metadata: { workflow_run_id },
    });

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
    logger.info({
      event_type: 'fetching_workflow_def',
      message: 'Fetching workflow definition',
      trace_id: workflow_run_id,
      metadata: {
        workflow_def_id: workflowRun.workflow_run.workflow_def_id,
        workflow_version: workflowRun.workflow_run.workflow_version,
      },
    });

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
    logger.info({
      event_type: 'creating_tokens_table',
      message: 'Creating tokens table in SQLite',
      trace_id: workflow_run_id,
      metadata: { workflow_run_id },
    });

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

    // Success for now
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
