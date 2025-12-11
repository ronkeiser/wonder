/**
 * Workflow Runs Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createWorkflowRunRoute, startWorkflowRunRoute } from './spec';

/** /{id}/runs */
export const workflowRuns = new OpenAPIHono<{ Bindings: Env }>();

/** POST /{id}/runs */
workflowRuns.openapi(createWorkflowRunRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { input } = c.req.valid('json');
  using workflowsResource = c.env.RESOURCES.workflows();
  const result = await workflowsResource.createRun(id, input);
  return c.json(result, 201);
});

/** POST /{id}/runs/{run_id}/start */
workflowRuns.openapi(startWorkflowRunRoute, async (c) => {
  const { id, run_id } = c.req.valid('param');
  using workflowsResource = c.env.RESOURCES.workflows();
  const result = await workflowsResource.startRun(id, run_id);
  return c.json(result, 200);
});
