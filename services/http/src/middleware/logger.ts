/**
 * Logger middleware for HTTP service
 * Creates a logger instance and tracks request lifecycle
 */

import { createLogger } from '@wonder/logs';
import { createMiddleware } from 'hono/factory';
import { ulid } from 'ulid';
import type { HttpEnv } from '~/types';

/**
 * Middleware that:
 * 1. Creates a logger instance bound to the LOGS service
 * 2. Generates a unique request ID for correlation
 * 3. Logs request start and completion with timing
 *
 * WebSocket upgrades are logged but completion is not tracked
 * since the connection stays open and is handled by Durable Objects
 */
export const loggerMiddleware = createMiddleware<HttpEnv>(async (c, next) => {
  const requestId = ulid();

  const logger = createLogger(c.executionCtx, c.env.LOGS, {
    service: c.env.SERVICE,
    environment: c.env.ENVIRONMENT,
  });

  c.set('logger', logger);
  c.set('requestId', requestId);

  const isWebSocket = c.req.header('Upgrade')?.toLowerCase() === 'websocket';
  const method = c.req.method;
  const path = c.req.path;

  // Log request start
  logger.info({
    event_type: 'http_request_started',
    request_id: requestId,
    message: `${method} ${path}`,
    metadata: {
      method,
      path,
      is_websocket: isWebSocket,
      user_agent: c.req.header('User-Agent'),
    },
  });

  const start = Date.now();

  await next();

  // Skip completion logging for WebSocket upgrades
  // The DO handles its own logging for the persistent connection
  if (isWebSocket) {
    return;
  }

  const duration = Date.now() - start;
  const status = c.res.status;

  // Log request completion
  logger.info({
    event_type: 'http_request_completed',
    request_id: requestId,
    message: `${method} ${path} ${status} ${duration}ms`,
    metadata: {
      method,
      path,
      status,
      duration_ms: duration,
    },
  });
});
