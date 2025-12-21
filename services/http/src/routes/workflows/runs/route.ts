/**
 * Workflow Runs Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { createWorkflowRunRoute, startWorkflowRunRoute } from './spec';

/** /{id}/runs */
export const workflowRuns = new OpenAPIHono<HttpEnv>();

/** POST /{id}/runs */
workflowRuns.openapi(createWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { input } = c.req.valid('json');
  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const result = await workflowRunsResource.create(id, input);
  return c.json(result, 201);
});

/** POST /{id}/runs/{runId}/start */
workflowRuns.openapi(startWorkflowRunRoute, async (c) => {
  const { runId } = c.req.valid('param');
  const body = c.req.valid('json');
  const coordinatorId = c.env.COORDINATOR.idFromName(runId);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);
  await coordinator.start(runId, { enableTraceEvents: body?.enableTraceEvents });
  return c.json({ durableObjectId: runId }, 200);
});
