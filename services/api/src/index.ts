/**
 * Wonder API Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { WorkflowTask } from './domains/execution/definitions';
import { handleFetch } from './handlers/fetch';
import { handleQueue } from './handlers/queue';
import { Workflows } from './rpc/workflows';

// Export Durable Objects (required for Workers runtime)
export { WorkflowCoordinator } from './domains/coordination';

/**
 * Wonder API Entrypoint
 * Handles HTTP requests, queue messages, and provides RPC methods
 */
export default class extends WorkerEntrypoint<Env> {
  /**
   * RPC: Workflows adapter
   */
  workflows() {
    return new Workflows(this.env, this.ctx);
  }

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
}
