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

  // TODO: Implement stream start connection to coordinator
});
