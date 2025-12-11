import { verifySession } from '$lib/auth';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Check authentication for all requests (except login/logout)
  const isAuthRoute = event.url.pathname.startsWith('/auth/');
  const sessionSecret = event.platform?.env?.SESSION_SECRET;

  if (sessionSecret && !isAuthRoute) {
    const cookies = event.request.headers.get('cookie');
    const authenticated = await verifySession(cookies, sessionSecret);

    if (!authenticated) {
      throw redirect(302, '/auth/login');
    }

    // Make auth state available to all pages
    event.locals.authenticated = true;
  }

  // Proxy API requests to the HTTP service
  if (event.url.pathname.startsWith('/api/')) {
    const httpService = event.platform?.env?.HTTP;
    const httpUrl = event.platform?.env?.HTTP_URL;
    const apiKey = event.platform?.env?.API_KEY;

    if (!httpService && !httpUrl) {
      return new Response('HTTP service not available', { status: 503 });
    }

    // Check if this is a WebSocket upgrade
    const isWebSocket = event.request.headers.get('upgrade')?.toLowerCase() === 'websocket';

    // Prepare headers - add API key only for non-WebSocket requests
    const headers = new Headers(event.request.headers);
    if (!isWebSocket && apiKey) {
      headers.set('X-API-Key', apiKey);
    }

    // Use service binding if available
    if (httpService) {
      return httpService.fetch(
        new Request(event.request.url, {
          method: event.request.method,
          headers,
          body: event.request.body,
        }),
      );
    }

    // Local development fallback: use HTTP_URL
    const url = new URL(event.url.pathname + event.url.search, httpUrl!);
    if (isWebSocket) {
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    }

    return fetch(url, {
      method: event.request.method,
      headers,
      body:
        event.request.method !== 'GET' && event.request.method !== 'HEAD'
          ? await event.request.text()
          : undefined,
    });
  }

  // For all other requests, use normal SvelteKit rendering
  return resolve(event);
};
