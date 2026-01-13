/**
 * Error logging middleware for HTTP service
 * Catches and logs errors before re-throwing for Hono's error handler
 */

import type { ErrorHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { HttpEnv } from '~/types';

/**
 * Extract detailed error information for logging and responses
 */
function getErrorDetails(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  code?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      code: (error as Error & { code?: string }).code,
    };
  }
  return {
    name: 'Unknown',
    message: String(error),
  };
}

/**
 * Middleware that wraps request handling to catch and log errors
 * Errors are logged with full context and then re-thrown
 */
export const errorLoggerMiddleware = createMiddleware<HttpEnv>(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const details = getErrorDetails(error);
    c.var.logger.error({
      eventType: 'http_request_error',
      requestId: c.var.requestId,
      message: details.message,
      metadata: {
        errorName: details.name,
        errorCode: details.code,
        stack: details.stack,
        cause: details.cause,
        path: c.req.path,
        method: c.req.method,
      },
    });
    throw error;
  }
});

/**
 * Global error handler for Hono
 * Returns structured JSON error responses with details
 */
export const errorHandler: ErrorHandler<HttpEnv> = (error, c) => {
  const details = getErrorDetails(error);
  const requestId = c.var?.requestId ?? 'unknown';

  // Log the error if not already logged by middleware
  c.var?.logger?.error({
    eventType: 'http_unhandled_error',
    requestId,
    message: details.message,
    metadata: {
      errorName: details.name,
      errorCode: details.code,
      stack: details.stack,
      cause: details.cause,
      path: c.req.path,
      method: c.req.method,
    },
  });

  // Determine status code based on error type
  const status =
    details.name === 'NotFoundError'
      ? 404
      : details.name === 'ValidationError'
        ? 400
        : details.name === 'UnauthorizedError'
          ? 401
          : details.name === 'ForbiddenError'
            ? 403
            : 500;

  // Return structured error response
  return c.json(
    {
      error: details.name,
      message: details.message,
      requestId,
      ...(details.code && { code: details.code }),
    },
    status as 400 | 401 | 403 | 404 | 500,
  );
};
