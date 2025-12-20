/**
 * Error logging middleware for HTTP service
 * Catches and logs errors before re-throwing for Hono's error handler
 */

import { createMiddleware } from 'hono/factory';
import type { HttpEnv } from '~/types';

/**
 * Middleware that wraps request handling to catch and log errors
 * Errors are logged with full context and then re-thrown
 */
export const errorLoggerMiddleware = createMiddleware<HttpEnv>(async (c, next) => {
  try {
    await next();
  } catch (error) {
    c.var.logger.error({
      eventType: 'http_request_error',
      requestId: c.var.requestId,
      message: error instanceof Error ? error.message : String(error),
      metadata: {
        errorName: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        path: c.req.path,
        method: c.req.method,
      },
    });
    throw error;
  }
});
