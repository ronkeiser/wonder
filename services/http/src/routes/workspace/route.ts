/**
 * Workspace Hono Router
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import {
    createWorkspaceRoute,
    deleteWorkspaceRoute,
    getWorkspaceRoute,
    listWorkspacesRoute,
    updateWorkspaceRoute,
} from './spec';

/** /workspaces */
export const workspaces = new OpenAPIHono<{ Bindings: Env }>();

/** GET / */
workspaces.openapi(listWorkspacesRoute, async (c) => {
  const query = c.req.valid('query');
  using workspaces = c.env.RESOURCES.workspaces();
  const result = await workspaces.list(query);
  return c.json(result);
});

/** POST / */
workspaces.openapi(createWorkspaceRoute, async (c) => {
  const validated = c.req.valid('json');
  using workspaces = c.env.RESOURCES.workspaces();
  const result = await workspaces.create(validated);
  return c.json(result, 201);
});

/** GET /{id} */
workspaces.openapi(getWorkspaceRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workspaces = c.env.RESOURCES.workspaces();
  const result = await workspaces.get(id);
  return c.json(result);
});

/** DELETE /{id} */
workspaces.openapi(deleteWorkspaceRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workspaces = c.env.RESOURCES.workspaces();
  await workspaces.delete(id);
  return c.json({ success: true });
});

/** PATCH /{id} */
workspaces.openapi(updateWorkspaceRoute, async (c) => {
  const { id } = c.req.valid('param');
  const validated = c.req.valid('json');
  using workspaces = c.env.RESOURCES.workspaces();
  const result = await workspaces.update(id, validated);
  return c.json(result);
});
