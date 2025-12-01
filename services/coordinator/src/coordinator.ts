import { DurableObject } from 'cloudflare:workers';
import { ContextManager } from './context.js';
import { handleTaskResults } from './results.js';
import { TokenManager } from './tokens.js';
import type { TaskResult } from './types.js';

/**
 * WorkflowCoordinator Durable Object
 */
export class WorkflowCoordinator extends DurableObject {
  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

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
   * Process task results
   */
  async processResults(results: TaskResult[]): Promise<void> {
    const context = new ContextManager(this.ctx.storage.sql);
    const tokens = new TokenManager(this.ctx.storage.sql);
    await handleTaskResults(results, context, tokens);
  }

  /**
   * Handle alarms for scheduled tasks
   */
  async alarm(): Promise<void> {
    console.log(`Alarm triggered for DO: ${this.ctx.id.toString()}`);
  }
}
