/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle via RPC.
 */

// Export Durable Objects (required for Workers runtime)
export { WorkflowCoordinator } from './coordinator';

/**
 * Worker entrypoint
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('OK', {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
