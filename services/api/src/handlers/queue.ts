/**
 * Queue consumer handler
 * Processes messages from Cloudflare Queues
 */

import { createLogger } from '@wonder/logger';
import { drizzle } from 'drizzle-orm/d1';
import type { WorkflowTask } from '~/domains/execution/definitions';
import { processWorkflowTask } from '~/domains/execution/worker';
import { createServiceContext } from '~/infrastructure/context';

export async function handleQueue(
  batch: MessageBatch<WorkflowTask>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const db = drizzle(env.DB);
  const logger = createLogger({});
  const serviceCtx = createServiceContext(db, env.AI, logger, ctx);

  for (const message of batch.messages) {
    try {
      await processWorkflowTask(message.body, serviceCtx, env.WORKFLOW_COORDINATOR);
      message.ack();
    } catch (error) {
      message.retry();
    }
  }
}
