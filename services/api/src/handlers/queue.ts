/**
 * Queue consumer handler
 * Processes messages from Cloudflare Queues
 */

import { drizzle } from 'drizzle-orm/d1';
import type { WorkflowTask } from '~/domains/execution/definitions';
import { processWorkflowTask } from '~/domains/execution/worker';

export async function handleQueue(batch: MessageBatch<WorkflowTask>, env: Env): Promise<void> {
  const db = drizzle(env.DB);

  for (const message of batch.messages) {
    try {
      await processWorkflowTask(message.body, {
        db,
        ai: env.AI,
        WORKFLOW_COORDINATOR: env.WORKFLOW_COORDINATOR,
      });
      message.ack();
    } catch (error) {
      message.retry();
    }
  }
}
