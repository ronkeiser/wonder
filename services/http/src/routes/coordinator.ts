import { Hono } from 'hono';

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

  // Get the Durable Object stub and forward the WebSocket upgrade request
  const id = c.env.COORDINATOR.idFromName(doId);
  const stub = c.env.COORDINATOR.get(id);
  return stub.fetch(c.req.raw);
});
