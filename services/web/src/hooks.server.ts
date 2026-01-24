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

    // Check for workspace cookie (skip for /workspaces routes and /api/ routes)
    const isWorkspacesRoute = event.url.pathname.startsWith('/workspaces');
    const isApiRoute = event.url.pathname.startsWith('/api/');
    if (!isWorkspacesRoute && !isApiRoute) {
      const workspaceCookie = event.cookies.get('workspace');
      if (!workspaceCookie) {
        throw redirect(302, '/workspaces');
      }
      event.locals.workspaceId = workspaceCookie;
    }
  }

  // Proxy API requests to the HTTP service
  if (event.url.pathname.startsWith('/api/')) {
    const httpService = event.platform?.env?.HTTP;
    const httpUrl = event.platform?.env?.HTTP_URL;
    const apiKey = event.platform?.env?.API_KEY;

    if (!httpService && !httpUrl) {
      return new Response('HTTP service not available', { status: 503 });
    }

    // Strip /api prefix - the HTTP service doesn't use it
    const backendPath = event.url.pathname.replace(/^\/api/, '');

    // Check if this is a WebSocket upgrade
    const isWebSocket = event.request.headers.get('upgrade')?.toLowerCase() === 'websocket';

    // Prepare headers - add API key only for non-WebSocket requests
    const headers = new Headers(event.request.headers);
    if (!isWebSocket && apiKey) {
      headers.set('X-API-Key', apiKey);
    }
    // Remove Accept-Encoding to prevent compression issues when proxying
    headers.delete('Accept-Encoding');

    // Prefer HTTP_URL for local development, fall back to service binding for production
    if (httpUrl) {
      // Local development: use HTTP_URL directly
      const url = new URL(backendPath + event.url.search, httpUrl);
      if (isWebSocket) {
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      }

      const response = await fetch(url, {
        method: event.request.method,
        headers,
        body:
          event.request.method !== 'GET' && event.request.method !== 'HEAD'
            ? await event.request.text()
            : undefined,
      });

      // Strip Content-Encoding header to prevent decoding issues
      // The response body is already decompressed by fetch()
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('Content-Encoding');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // Production: use service binding
    if (httpService) {
      const originalUrl = new URL(event.request.url);
      const proxyUrl = new URL(backendPath + originalUrl.search, originalUrl.origin);
      return httpService.fetch(
        new Request(proxyUrl, {
          method: event.request.method,
          headers,
          body: event.request.body,
        }),
      );
    }

    return new Response('HTTP service not available', { status: 503 });
  }

  // For all other requests, use normal SvelteKit rendering
  return resolve(event);
};
