/**
 * Workflow Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createWorkflowRoute, getWorkflowRoute, startWorkflowRoute } from './spec';

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

  // Trigger workflow execution via coordinator DO (RPC)
  const coordinatorId = c.env.COORDINATOR.idFromName(result.durable_object_id);
  const coordinator = c.env.COORDINATOR.get(coordinatorId);

  try {
    await coordinator.start(result.workflow_run_id, input);
  } catch (error) {
    console.error('Failed to trigger coordinator:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: `Failed to start workflow: ${errorMessage}` }, 500);
  }

  return c.json(result);
});
