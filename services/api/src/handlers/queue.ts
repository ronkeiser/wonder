/**
 * Queue consumer handler
 * Processes messages from Cloudflare Queues
 */

import { drizzle } from 'drizzle-orm/d1';
import type { WorkflowTask } from '~/domains/execution/definitions';
import { processWorkflowTask } from '~/domains/execution/worker';

export async function handleQueue(batch: MessageBatch<WorkflowTask>, env: Env): Promise<void> {
  console.log('[Queue] Received batch', {
    message_count: batch.messages.length,
    queue: batch.queue,
  });

  const db = drizzle(env.DB);

  for (const message of batch.messages) {
    console.log('[Queue] Processing message', {
      task_id: message.body.task_id,
      workflow_run_id: message.body.workflow_run_id,
    });

    try {
      await processWorkflowTask(message.body, {
        db,
        ai: env.AI,
        WORKFLOW_COORDINATOR: env.WORKFLOW_COORDINATOR,
      });
      message.ack();
      console.log('[Queue] Message acknowledged', {
        task_id: message.body.task_id,
      });
    } catch (error) {
      console.error('[Queue] Task processing failed', {
        task_id: message.body.task_id,
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry();
    }
  }
}
