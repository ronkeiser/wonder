import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Proxy API requests to the HTTP service
  if (event.url.pathname.startsWith('/api/')) {
    const httpService = event.platform?.env?.HTTP;
    if (!httpService) {
      return new Response('HTTP service not available', { status: 503 });
    }

    // For WebSocket upgrades, forward to HTTP service
    if (event.request.headers.get('upgrade') === 'websocket') {
      return httpService.fetch(event.request);
    }

    // For regular API requests, forward to HTTP service
    const response = await httpService.fetch(event.request);
    return response;
  }

  // For all other requests, use normal SvelteKit rendering
  return resolve(event);
};
