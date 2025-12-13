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

  // 1. Create workflow run
  using workflowRunsResource = c.env.RESOURCES.workflowRuns();
  const { workflow_run_id } = await workflowRunsResource.create(id, input);

  // 2. Start the coordinator DO
  const coordinatorId = c.env.COORDINATOR.idFromName(workflow_run_id);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);
  await coordinator.start(workflow_run_id);

  return c.json({ workflow_run_id, durable_object_id: workflow_run_id }, 200);
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
