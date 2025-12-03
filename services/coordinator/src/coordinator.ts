import type { Emitter, EventContext, EventInput } from '@wonder/events';
import type { Logger } from '@wonder/logs';
import { DurableObject } from 'cloudflare:workers';

/**
 * WorkflowCoordinator Durable Object
 */
export class WorkflowCoordinator extends DurableObject {
  private logger: Logger | null = null;
  private emitter: Emitter | null = null;
  private sequenceCounter = 0;

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
   * Get or create universal emitter instance
   */
  private getEmitter(): Emitter {
    if (!this.emitter) {
      // Create emitter that calls EventsService.write() via RPC
      this.emitter = {
        emit: (context: EventContext, input: EventInput) => {
          this.env.EVENTS.write(context, input);
        },
      };
    }
    return this.emitter;
  }

  /**
   * Start workflow execution (RPC method)
   */
  async start(workflow_run_id: string, input: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    const logger = this.getLogger();

    try {
      // Look up workflow run metadata from resources service
      const workflowRun = (await this.env.RESOURCES.workflowRuns().get(workflow_run_id)) as {
        workflow_run: {
          id: string;
          project_id: string;
          workspace_id: string;
          workflow_id: string;
          workflow_def_id: string;
          parent_run_id: string | null;
        };
      };

      logger.info({
        event_type: 'workflow_start_request',
        message: 'Received workflow start request',
        trace_id: workflow_run_id,
        workspace_id: workflowRun.workflow_run.workspace_id,
        project_id: workflowRun.workflow_run.project_id,
        metadata: { duration_ms: Date.now() - startTime },
      });

      // Create event context for this workflow run
      const eventContext: EventContext = {
        workflow_run_id,
        workspace_id: workflowRun.workflow_run.workspace_id,
        project_id: workflowRun.workflow_run.project_id,
        workflow_def_id: workflowRun.workflow_run.workflow_def_id,
        parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
      };

      const emitter = this.getEmitter();
      emitter.emit(eventContext, {
        event_type: 'workflow_started',
        sequence_number: this.sequenceCounter++,
        metadata: { input },
      });

      // Create task
      const task = {
        workflow_run_id,
        token_id: 'token-' + Date.now(),
        node_id: 'initial-node',
        action_kind: 'llm_call',
        input_data: input,
        retry_count: 0,
      };

      logger.debug({
        event_type: 'task_dispatch',
        message: 'Dispatching initial task to executor',
        trace_id: workflow_run_id,
        metadata: { task, duration_ms: Date.now() - startTime },
      });

      // Dispatch work async via waitUntil
      this.ctx.waitUntil(this.processTaskAsync(task));
    } catch (error) {
      logger.error({
        event_type: 'workflow_start_error',
        message: 'Failed to start workflow',
        metadata: { error: String(error), duration_ms: Date.now() - startTime },
      });
      throw error;
    }
  }

  /**
   * Process task asynchronously via RPC to executor
   */
  async processTaskAsync(task: {
    workflow_run_id: string;
    token_id: string;
    node_id: string;
    action_kind: string;
    input_data: Record<string, unknown>;
    retry_count: number;
  }): Promise<void> {
    const taskStartTime = Date.now();
    const logger = this.getLogger();
    const emitter = this.getEmitter();

    // Look up workflow run metadata for event context
    const workflowRun = (await this.env.RESOURCES.workflowRuns().get(task.workflow_run_id)) as {
      workflow_run: {
        id: string;
        project_id: string;
        workspace_id: string;
        workflow_id: string;
        workflow_def_id: string;
        parent_run_id: string | null;
      };
    };
    const eventContext: EventContext = {
      workflow_run_id: task.workflow_run_id,
      workspace_id: workflowRun.workflow_run.workspace_id,
      project_id: workflowRun.workflow_run.project_id,
      workflow_def_id: workflowRun.workflow_run.workflow_def_id,
      parent_run_id: workflowRun.workflow_run.parent_run_id ?? undefined,
    };

    try {
      logger.info({
        event_type: 'task_processing_started',
        message: 'Started processing task',
        trace_id: task.workflow_run_id,
        metadata: { task_id: task.node_id, token_id: task.token_id },
      });

      // Emit node_started event
      emitter.emit(eventContext, {
        event_type: 'node_started',
        sequence_number: this.sequenceCounter++,
        node_id: task.node_id,
        token_id: task.token_id,
        metadata: { action_kind: task.action_kind, retry_count: task.retry_count },
      });

      // Call executor via RPC
      const result = (await this.env.EXECUTOR.executeTask(task)) as {
        task_id: string;
        workflow_run_id: string;
        token_id: string;
        node_id: string;
        success: boolean;
        output_data?: Record<string, unknown>;
        error?: string;
        completed_at: string;
        tokens?: number;
        cost_usd?: number;
      };

      const duration = Date.now() - taskStartTime;

      // Process the result
      if (result.success && result.output_data) {
        logger.info({
          event_type: 'task_processing_completed',
          message: 'Task processing completed successfully',
          trace_id: task.workflow_run_id,
          metadata: { task_id: task.node_id, token_id: task.token_id, duration_ms: duration },
        });

        // Emit node_completed event
        emitter.emit(eventContext, {
          event_type: 'node_completed',
          sequence_number: this.sequenceCounter++,
          node_id: task.node_id,
          token_id: task.token_id,
          tokens: result.tokens,
          cost_usd: result.cost_usd,
          metadata: { output_data: result.output_data, duration_ms: duration },
        });

        // Emit workflow_completed event (for now, since this is a simple single-node flow)
        emitter.emit(eventContext, {
          event_type: 'workflow_completed',
          sequence_number: this.sequenceCounter++,
          metadata: { output: result.output_data, duration_ms: duration },
        });
      } else {
        logger.error({
          event_type: 'task_processing_failed',
          message: 'Task processing failed',
          trace_id: task.workflow_run_id,
          metadata: {
            task_id: task.node_id,
            token_id: task.token_id,
            error: result.error,
            duration_ms: duration,
          },
        });

        // Emit node_failed event
        emitter.emit(eventContext, {
          event_type: 'node_failed',
          sequence_number: this.sequenceCounter++,
          node_id: task.node_id,
          token_id: task.token_id,
          message: result.error || 'Task failed',
          metadata: { duration_ms: duration },
        });

        // Emit workflow_failed event
        emitter.emit(eventContext, {
          event_type: 'workflow_failed',
          sequence_number: this.sequenceCounter++,
          message: result.error || 'Workflow execution failed',
          metadata: { duration_ms: duration },
        });
      }
    } catch (error) {
      const duration = Date.now() - taskStartTime;

      logger.error({
        event_type: 'task_processing_error',
        message: 'Task processing threw exception',
        trace_id: task.workflow_run_id,
        metadata: {
          task_id: task.node_id,
          token_id: task.token_id,
          error: String(error),
          duration_ms: duration,
        },
      });

      // Emit node_failed event
      emitter.emit(eventContext, {
        event_type: 'node_failed',
        sequence_number: this.sequenceCounter++,
        node_id: task.node_id,
        token_id: task.token_id,
        message: String(error),
        metadata: { duration_ms: duration },
      });

      // Emit workflow_failed event
      emitter.emit(eventContext, {
        event_type: 'workflow_failed',
        sequence_number: this.sequenceCounter++,
        message: `Workflow execution error: ${String(error)}`,
        metadata: { duration_ms: duration },
      });
    }
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
