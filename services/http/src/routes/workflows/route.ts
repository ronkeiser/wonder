/**
 * Workflow Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { workflowRuns } from './runs/route';
import {
  createWorkflowRoute,
  deleteWorkflowRoute,
  getWorkflowRoute,
  startWorkflowRoute,
} from './spec';

/** /workflows */
export const workflows = new OpenAPIHono<HttpEnv>();

/** POST / */
workflows.openapi(createWorkflowRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
workflows.openapi(getWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.get(id);
  return c.json(result);
});

/** POST /{id}/start */
workflows.openapi(startWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { stream, input } = c.req.valid('json');

  // 1. Create workflow run
  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const { workflowRunId } = await workflowRunsResource.create(id, input ?? {});

  // 2. Get coordinator DO
  const coordinatorId = c.env.COORDINATOR.idFromName(workflowRunId);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);

  // Non-streaming mode: start and return immediately
  if (!stream) {
    await coordinator.start(workflowRunId);
    return c.json({ workflowRunId, durableObjectId: workflowRunId }, 200);
  }

  // Streaming mode: connect to Streamer DO for SSE
  const streamerId = c.env.EVENTS_STREAMER.idFromName(workflowRunId);
  const streamer = c.env.EVENTS_STREAMER.get(streamerId);

  // Start coordinator in background (don't await)
  c.executionCtx.waitUntil(coordinator.start(workflowRunId));

  // Connect to Streamer's SSE endpoint
  const sseUrl = new URL(c.req.url);
  sseUrl.pathname = '/sse';
  // Filter to this specific workflow run
  sseUrl.searchParams.set('streamId', workflowRunId);

  const sseResponse = await streamer.fetch(new Request(sseUrl));

  // Return the SSE stream directly from the Streamer
  return new Response(sseResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

/** DELETE /{id} */
workflows.openapi(deleteWorkflowRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflows = c.env.RESOURCES.workflows();
  const result = await workflows.delete(id);
  return c.json(result);
});

// Mount runs sub-router
workflows.route('/', workflowRuns);
