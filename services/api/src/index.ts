/**
 * Wonder API Worker - Main entry point
 *
 * This worker serves the Wonder API and exports Durable Object classes.
 */

// Export Durable Objects (required for Workers runtime)
export { WorkflowCoordinator } from './infrastructure/do/workflow-coordinator';

// Main worker fetch handler (placeholder for Stage 0)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('Wonder API - Stage 0', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};
