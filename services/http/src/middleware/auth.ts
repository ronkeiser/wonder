/**
 * Authentication middleware for Wonder HTTP service
 * Validates API key in X-API-Key header
 */

import type { Context, Next } from 'hono';

/**
 * Middleware to require API key authentication
 * Expects the API key in the X-API-Key header
 */
export async function requireApiKey(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    return c.json({ error: 'Missing X-API-Key header' }, 401);
  }

  if (apiKey !== c.env.API_KEY) {
    return c.json({ error: 'Invalid API key' }, 403);
  }

  await next();
}
