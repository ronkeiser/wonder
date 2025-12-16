/**
 * Authentication middleware for Wonder HTTP service
 * Validates API key in X-API-Key header
 */

import type { Context, Next } from 'hono';
import type { HttpEnv } from '~/types';

/**
 * Middleware to require API key authentication
 * Expects the API key in the X-API-Key header
 *
 * WebSocket upgrades are allowed through - auth will be handled in the ws package
 */
export async function auth(c: Context<HttpEnv>, next: Next): Promise<Response | void> {
  // Allow WebSocket upgrades through without auth
  const upgrade = c.req.header('Upgrade');
  if (upgrade?.toLowerCase() === 'websocket') {
    await next();
    return;
  }

  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    return c.json({ error: 'Missing X-API-Key header' }, 401);
  }

  if (apiKey !== c.env.API_KEY) {
    return c.json({ error: 'Invalid API key' }, 403);
  }

  await next();
}
