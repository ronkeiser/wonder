import { Hono } from 'hono';

interface Env {
  API: any; // RPC binding to wonder-api
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
    // Forward WebSocket upgrade through RPC to API service
    using coordination = c.env.API.coordination();
    return await coordination.streamEvents(doId, c.req.raw);
  } catch (err) {
    return c.json(
      {
        error: 'WebSocket connection failed',
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
