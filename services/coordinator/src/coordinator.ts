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
