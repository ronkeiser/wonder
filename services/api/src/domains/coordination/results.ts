/** Task result processing */

import type { Logger } from '@wonder/logger';
import type { EventBuffer } from '../events/buffer';
import type { WorkflowTaskResult } from '../execution/definitions';
import type { ContextManager } from './context';
import type { WorkflowLifecycle } from './lifecycle';
import type { TokenManager } from './tokens';

/**
 * Processes task results from workers.
 * Updates context, tokens, emits events, checks for completion.
 */
export class TaskResultProcessor {
  constructor(
    private logger: Logger,
    private context: ContextManager,
    private tokens: TokenManager,
    private events: EventBuffer,
    private lifecycle: WorkflowLifecycle,
  ) {}

  /**
   * Process task result from worker.
   * Updates context, updates token, emits events, checks for completion.
   */
  async process(result: WorkflowTaskResult): Promise<void> {
    const workflowRunId = this.lifecycle.getWorkflowRunId();
    if (!workflowRunId) {
      throw new Error('Workflow not initialized');
    }

    this.logger.info('processing_task_result', {
      workflow_run_id: workflowRunId,
      task_id: result.task_id,
      token_id: result.token_id,
      status: result.status,
    });

    if (result.status === 'failure') {
      const errorMessage =
        typeof result.error === 'string' ? result.error : result.error?.message || 'Unknown error';
      this.lifecycle.fail(result.token_id, result.task_id, errorMessage);
      return;
    }

    // Update context with output data
    if (result.output_data) {
      const currentContext = this.context.get();
      currentContext.state = {
        ...currentContext.state,
        ...result.output_data,
      };
      this.context.update(currentContext);

      this.logger.info('context_updated_with_output', {
        workflow_run_id: workflowRunId,
        output_data: result.output_data,
      });
    }

    // Update token status
    this.tokens.updateStatus(result.token_id, 'completed');

    // Emit node_completed event
    this.events.emit('node_completed', {
      token_id: result.token_id,
      result: result.output_data,
    });

    // Check for workflow completion (Stage 0: single node, so always complete after first task)
    this.lifecycle.complete();
  }
}
