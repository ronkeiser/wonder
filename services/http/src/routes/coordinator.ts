import { Hono } from 'hono';

interface Env {
  WORKFLOW_COORDINATOR: DurableObjectNamespace;
}

export const coordinator = new Hono<{ Bindings: Env }>();

// WebSocket event streaming: /api/coordinator/:doId/stream
coordinator.get('/:doId/stream', async (c) => {
  const doId = c.req.param('doId');
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return c.json(
      {
        error: 'WebSocket upgrade required',
        received_upgrade: upgradeHeader,
      },
      400,
    );
  }

  try {
    // Get DO stub directly and forward WebSocket upgrade
    const id = c.env.WORKFLOW_COORDINATOR.idFromString(doId);
    const stub = c.env.WORKFLOW_COORDINATOR.get(id);

    // Create new request with /stream path for DO
    const url = new URL(c.req.url);
    url.pathname = '/stream';
    const doRequest = new Request(url, c.req.raw);

    return await stub.fetch(doRequest);
  } catch (err) {
    return c.json(
      {
        error: 'Invalid durable object ID',
        message: err instanceof Error ? err.message : String(err),
      },
      400,
    );
  }
});
