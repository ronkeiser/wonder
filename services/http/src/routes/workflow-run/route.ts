/**
 * Workflow Run Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { streamWorkflowRunRoute } from './spec';

/** /workflow-runs */
export const workflowRuns = new OpenAPIHono<{ Bindings: Env }>();

/** GET /{id}/stream */
workflowRuns.openapi(streamWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
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

  // Get the Coordinator Durable Object stub using the workflow run ID
  const doId = c.env.COORDINATOR.idFromName(id);
  const stub = c.env.COORDINATOR.get(doId);
  return stub.fetch(c.req.raw);
});
