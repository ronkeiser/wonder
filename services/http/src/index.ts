/**
 * Wonder HTTP Worker
 * Thin HTTP-to-RPC bridge for REST API and WebSocket gateway
 */

interface Env {
  API: any; // RPC binding to wonder-api
  WORKFLOW_COORDINATOR: DurableObjectNamespace; // Direct DO binding for WebSocket upgrades
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

    // WebSocket event streaming: /api/coordinator/:doId/stream
    const coordinatorStreamMatch = url.pathname.match(/^\/api\/coordinator\/([^/]+)\/stream$/);
    if (coordinatorStreamMatch) {
      const doId = coordinatorStreamMatch[1];
      const upgradeHeader = request.headers.get('Upgrade');

      if (upgradeHeader === 'websocket') {
        try {
          // Get DO stub directly and forward WebSocket upgrade
          const id = env.WORKFLOW_COORDINATOR.idFromString(doId);
          const stub = env.WORKFLOW_COORDINATOR.get(id);

          // Create new request with /stream path for DO
          const doUrl = new URL(request.url);
          doUrl.pathname = '/stream';
          const doRequest = new Request(doUrl, request);

          return await stub.fetch(doRequest);
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: 'Invalid durable object ID',
              message: err instanceof Error ? err.message : String(err),
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            error: 'WebSocket upgrade required',
            received_upgrade: upgradeHeader,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
