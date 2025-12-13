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
  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const result = await workflowRunsResource.create(id, input);
  return c.json(result, 201);
});

/** POST /{id}/runs/{run_id}/start */
workflowRuns.openapi(startWorkflowRunRoute, async (c) => {
  const { id, run_id } = c.req.valid('param');
  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const result = await workflowRunsResource.start(run_id, id);
  return c.json(result, 200);
});
