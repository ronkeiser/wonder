/**
 * Wonder HTTP Worker
 * Thin HTTP-to-RPC bridge for REST API
 */

interface Env {
  API: any; // RPC binding to wonder-api
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Route: POST /api/workflows/:id/start
    const startMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/start$/);
    if (startMatch && request.method === 'POST') {
      const workflowId = startMatch[1];
      const input = await request.json();
      const result = await env.API.workflows().start(workflowId, input as Record<string, unknown>);
      return Response.json(result);
    }

    return new Response('Not Found', { status: 404 });
  },
};
