/**
 * Workflow Run Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import {
  cancelWorkflowRunRoute,
  deleteWorkflowRunRoute,
  listWorkflowRunsRoute,
  streamWorkflowRunRoute,
} from './spec';

/** /workflow-runs */
export const workflowRuns = new OpenAPIHono<HttpEnv>();

/** GET / - List workflow runs */
workflowRuns.openapi(listWorkflowRunsRoute, async (c) => {
  const { limit, offset, status, projectId } = c.req.valid('query');

  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const result = await workflowRunsResource.list({
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
    status: status
      ? (status.split(',') as ('running' | 'completed' | 'failed' | 'waiting')[])
      : undefined,
    projectId,
  });

  return c.json(result);
});

/** GET /stream - EventHub for workflow run status changes (sidebar) */
workflowRuns.get('/stream', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return c.json(
      {
        error: 'WebSocket upgrade required',
        receivedUpgrade: upgradeHeader,
      },
      400,
    );
  }

  // Route to EventHub singleton for status change broadcasts
  const hubId = c.env.EVENT_HUB.idFromName('global');
  const stub = c.env.EVENT_HUB.get(hubId);

  // Rewrite the URL to /stream (what EventHub expects)
  const url = new URL(c.req.url);
  url.pathname = '/stream';
  const request = new Request(url, c.req.raw);

  return stub.fetch(request);
});

/** GET /{id}/stream - Per-run event streaming */
workflowRuns.openapi(streamWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader !== 'websocket') {
    return c.json(
      {
        error: 'WebSocket upgrade required',
        receivedUpgrade: upgradeHeader,
      },
      400,
    );
  }

  // Route to per-run Streamer DO for detailed event streaming
  const doId = c.env.EVENTS_STREAMER.idFromName(id);
  const stub = c.env.EVENTS_STREAMER.get(doId);

  // Rewrite the URL to /stream (what Streamer expects)
  const url = new URL(c.req.url);
  url.pathname = '/stream';
  const request = new Request(url, c.req.raw);

  return stub.fetch(request);
});

/** DELETE /{id} */
workflowRuns.openapi(deleteWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflowRuns = c.env.RESOURCES.workflowRuns();
  const result = await workflowRuns.delete(id);
  return c.json(result);
});

/** POST /{id}/cancel */
workflowRuns.openapi(cancelWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const reason = body?.reason ?? 'User requested cancellation';
  const coordinatorId = c.env.COORDINATOR.idFromName(id);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);
  await coordinator.cancel(reason);
  return c.json({ cancelled: true, workflowRunId: id }, 200);
});
