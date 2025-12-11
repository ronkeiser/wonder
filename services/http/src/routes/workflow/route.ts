/**
 * Workflow Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowRuns } from './runs/route';
import {
  createWorkflowRoute,
  deleteWorkflowRoute,
  getWorkflowRoute,
  startWorkflowRoute,
} from './spec';

/** /workflows */
export const workflows = new OpenAPIHono<{ Bindings: Env }>();

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
  const input = c.req.valid('json');
  using workflowsResource = c.env.RESOURCES.workflows();
  const result = await workflowsResource.start(id, input);
  return c.json(result, 200);
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
