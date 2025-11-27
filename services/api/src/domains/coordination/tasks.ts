/** Task queue operations */

import type { Logger } from '@wonder/logger';
import { ulid } from 'ulid';
import type { Token, WorkflowTask } from '../execution/definitions';
import type { EventManager } from './events';

export class TaskDispatcher {
  private queue: Queue<WorkflowTask>;
  private logger: Logger;
  private events: EventManager;

  constructor(queue: Queue<WorkflowTask>, logger: Logger, events: EventManager) {
    this.queue = queue;
    this.logger = logger;
    this.events = events;
  }

  enqueue(
    token: Token,
    workflowRunId: string,
    durableObjectId: string,
    context: import('../execution/definitions').Context,
  ): void {
    const taskId = ulid();

    // Emit node_started event
    this.events.emit('node_started', {
      token_id: token.id,
      node_id: token.node_id,
    });

    const task: WorkflowTask = {
      task_id: taskId,
      workflow_run_id: workflowRunId,
      token_id: token.id,
      node_id: token.node_id,
      action_id: '', // Will be filled by worker from node lookup
      action_kind: 'llm_call', // Simplified for Stage 0
      action_implementation: {}, // Will be filled by worker
      input_data: {}, // Will be populated by worker via input_mapping
      context: context,
      durable_object_id: durableObjectId,
      enqueued_at: new Date().toISOString(),
    };

    this.logger.info('task_enqueued', {
      workflow_run_id: workflowRunId,
      task_id: taskId,
      token_id: token.id,
      node_id: token.node_id,
    });

    // Send to queue
    try {
      this.queue.send(task);
      this.logger.info('task_sent_to_queue', {
        task_id: taskId,
        queue_available: !!this.queue,
      });
    } catch (err) {
      this.logger.error('queue_send_failed', {
        task_id: taskId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
