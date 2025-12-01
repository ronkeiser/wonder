/**
 * Wonder Coordinator Service
 *
 * Durable Object-based workflow orchestration service.
 * Manages workflow lifecycle, token state, and task distribution.
 */

import { DurableObject } from 'cloudflare:workers';

/**
 * WorkflowCoordinator Durable Object
 *
 * Each workflow run gets its own instance with:
 * - Isolated SQLite storage for context and tokens
 * - State machine for workflow lifecycle
 * - Task queue coordination
 */
export class WorkflowCoordinator extends DurableObject {
  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Hello world endpoint
    if (url.pathname === '/hello') {
      return new Response(
        JSON.stringify({
          message: 'Hello from WorkflowCoordinator!',
          id: this.ctx.id.toString(),
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          id: this.ctx.id.toString(),
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    console.log(`Alarm triggered for DO: ${this.ctx.id.toString()}`);
  }
}

/**
 * Worker entrypoint for testing DO access
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Create or get a DO instance
    if (url.pathname === '/coordinator') {
      // Use a test ID or parse from query params
      const doId = url.searchParams.get('id') || 'test-workflow-001';
      const id = env.WORKFLOW_COORDINATOR.idFromName(doId);
      const stub = env.WORKFLOW_COORDINATOR.get(id);

      // Forward request to DO
      return await stub.fetch(new Request(`${url.origin}/hello`, request));
    }

    return new Response(
      JSON.stringify({
        message: 'Wonder Coordinator Service',
        endpoints: {
          '/coordinator?id=<workflow_id>': 'Access a workflow coordinator instance',
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  },
};
