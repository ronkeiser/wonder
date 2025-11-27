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
export { WorkflowCoordinator } from './domains/execution/coordinator';

/**
 * HTTP fetch handler (service worker format for WebSocket support)
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleFetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<WorkflowTask>, env: Env): Promise<void> {
    return handleQueue(batch, env);
  },
};
