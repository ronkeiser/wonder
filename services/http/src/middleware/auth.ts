/**
 * Authentication middleware for Wonder HTTP service
 * Validates API key in X-API-Key header
 */

import type { Context, Next } from 'hono';

/**
 * Middleware to require API key authentication
 * Expects the API key in the X-API-Key header or apiKey query parameter (for WebSocket upgrades)
 */
export async function auth(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  // Check header first (for regular HTTP requests)
  let apiKey = c.req.header('X-API-Key');

  // For WebSocket upgrades, check query parameter (browsers can't set custom headers)
  if (!apiKey && c.req.header('Upgrade') === 'websocket') {
    apiKey = c.req.query('apiKey');
  }

  if (!apiKey) {
    return c.json({ error: 'Missing X-API-Key header or apiKey query parameter' }, 401);
  }

  if (apiKey !== c.env.API_KEY) {
    return c.json({ error: 'Invalid API key' }, 403);
  }

  await next();
}
