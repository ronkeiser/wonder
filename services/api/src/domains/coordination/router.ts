/** HTTP request router for WorkflowCoordinator DO */

import type { Logger } from '@wonder/logger';

type RouteHandler = (request: Request) => Promise<Response>;

/**
 * Routes incoming HTTP requests to appropriate handlers.
 * Keeps routing logic separate from business logic.
 */
export class RequestRouter {
  private handlers: Map<string, RouteHandler>;

  constructor(
    private logger: Logger,
    handlers: {
      execute: RouteHandler;
      taskResult: RouteHandler;
      pendingData: RouteHandler;
      websocket: RouteHandler;
    },
  ) {
    this.handlers = new Map([
      ['POST /execute', handlers.execute],
      ['POST /task-result', handlers.taskResult],
      ['GET /pending-data', handlers.pendingData],
      ['UPGRADE /stream', handlers.websocket],
    ]);
  }

  async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const isWebSocket = request.headers.get('Upgrade') === 'websocket';
    const method = isWebSocket ? 'UPGRADE' : request.method;
    const key = `${method} ${url.pathname}`;

    this.logger.info('coordinator_fetch', {
      pathname: url.pathname,
      method,
      upgrade: isWebSocket ? 'websocket' : null,
    });

    const handler = this.handlers.get(key);
    if (!handler) {
      return new Response('Not Found', { status: 404 });
    }

    try {
      return await handler(request);
    } catch (err) {
      this.logger.error('coordinator_request_failed', {
        path: url.pathname,
        error: err instanceof Error ? err.message : String(err),
      });
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
}
