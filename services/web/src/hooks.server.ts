import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Proxy API requests to the HTTP service
  if (event.url.pathname.startsWith('/api/')) {
    const httpService = event.platform?.env?.HTTP;
    const httpUrl = event.platform?.env?.HTTP_URL;

    // Use service binding if available, otherwise fall back to HTTP_URL for local dev
    if (httpService) {
      // For WebSocket upgrades, forward to HTTP service
      const upgrade = event.request.headers.get('upgrade');
      if (upgrade?.toLowerCase() === 'websocket') {
        return httpService.fetch(event.request);
      }

      // For regular API requests, forward to HTTP service
      const response = await httpService.fetch(event.request);
      return response;
    } else if (httpUrl) {
      // Local development fallback: use HTTP_URL
      const url = new URL(event.url.pathname + event.url.search, httpUrl);

      // For WebSocket upgrades, forward to remote service
      const upgrade = event.request.headers.get('upgrade');
      if (upgrade?.toLowerCase() === 'websocket') {
        // Change protocol to wss for remote websocket
        url.protocol = 'wss:';
        const wsUrl = url.toString().replace('/api/', '/stream/');
        return fetch(wsUrl, {
          headers: event.request.headers,
        });
      }

      // For regular API requests, forward to remote HTTP service
      const response = await fetch(url, {
        method: event.request.method,
        headers: event.request.headers,
        body:
          event.request.method !== 'GET' && event.request.method !== 'HEAD'
            ? await event.request.text()
            : undefined,
      });
      return response;
    }

    return new Response('HTTP service not available', { status: 503 });
  }

  // For all other requests, use normal SvelteKit rendering
  return resolve(event);
};
