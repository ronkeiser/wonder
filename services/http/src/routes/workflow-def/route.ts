/**
 * Workflow Definition Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { HttpEnv } from '~/types';
import { createWorkflowDefRoute, deleteWorkflowDefRoute, getWorkflowDefRoute } from './spec';

/** /workflow-defs */
export const workflowDefs = new OpenAPIHono<HttpEnv>();

/** POST / */
workflowDefs.openapi(createWorkflowDefRoute, async (c) => {
  const validated = c.req.valid('json');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
workflowDefs.openapi(getWorkflowDefRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { version } = c.req.valid('query');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  const result = await workflowDefs.get(id, version);
  return c.json(result);
});

/** DELETE /{id} */
workflowDefs.openapi(deleteWorkflowDefRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workflowDefs = c.env.RESOURCES.workflowDefs();
  await workflowDefs.delete(id);
  return c.json({ success: true });
});
