/**
 * Wonder API Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */

import { createLogger } from '@wonder/logger';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import type { WorkflowTask } from './domains/execution/definitions';
import { startWorkflow } from './domains/execution/service';
import { handleFetch } from './handlers/fetch';
import { handleQueue } from './handlers/queue';

// Export Durable Objects (required for Workers runtime)
export { WorkflowCoordinator } from './domains/execution/coordinator';

/**
 * Wonder API Entrypoint
 * Handles HTTP requests, queue messages, and provides RPC methods
 */
export default class extends WorkerEntrypoint<Env> {
  /**
   * HTTP fetch handler
   */
  async fetch(request: Request): Promise<Response> {
    return handleFetch(request, this.env, this.ctx);
  }

  /**
   * Queue consumer handler
   */
  async queue(batch: MessageBatch<WorkflowTask>): Promise<void> {
    return handleQueue(batch, this.env);
  }

  /**
   * RPC: Start a workflow execution
   */
  async startWorkflow(workflowId: string, input: Record<string, unknown>) {
    const db = drizzle(this.env.DB);
    const logger = createLogger({ consoleOnly: true });
    const ctx = {
      db,
      ai: this.env.AI,
      WORKFLOW_COORDINATOR: this.env.WORKFLOW_COORDINATOR,
      logger,
    };
    return startWorkflow(ctx, workflowId, input);
  }
}
