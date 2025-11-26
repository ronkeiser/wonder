/** Task queue operations */

import type { Logger } from '@wonder/logger';
import { ulid } from 'ulid';
import type { WorkflowTask } from '~/infrastructure/queue/types';
import type { Token } from './definitions';
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

  enqueue(token: Token, workflowRunId: string, durableObjectId: string): void {
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
      input_data: {}, // For Stage 0, worker will read from context
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
    this.queue.send(task);
  }
}
