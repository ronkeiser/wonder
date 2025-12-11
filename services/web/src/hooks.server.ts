import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Proxy API requests to the HTTP service
  if (event.url.pathname.startsWith('/api/')) {
    const httpService = event.platform?.env?.HTTP;
    const httpUrl = event.platform?.env?.HTTP_URL;
    const apiKey = event.platform?.env?.API_KEY;

    // Use service binding if available, otherwise fall back to HTTP_URL for local dev
    if (httpService) {
      // For WebSocket upgrades, forward to HTTP service
      const upgrade = event.request.headers.get('upgrade');
      if (upgrade?.toLowerCase() === 'websocket') {
        const headers = new Headers(event.request.headers);
        if (apiKey) headers.set('X-API-Key', apiKey);
        return httpService.fetch(new Request(event.request, { headers }));
      }

      // For regular API requests, forward to HTTP service
      const headers = new Headers(event.request.headers);
      if (apiKey) headers.set('X-API-Key', apiKey);
      const response = await httpService.fetch(new Request(event.request, { headers }));
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
        const headers = new Headers(event.request.headers);
        if (apiKey) headers.set('X-API-Key', apiKey);
        return fetch(wsUrl, {
          headers,
        });
      }

      // For regular API requests, forward to remote HTTP service
      const headers = new Headers(event.request.headers);
      if (apiKey) headers.set('X-API-Key', apiKey);
      const response = await fetch(url, {
        method: event.request.method,
        headers,
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
