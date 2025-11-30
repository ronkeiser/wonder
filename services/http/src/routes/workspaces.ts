import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { CreateWorkspaceSchema, WorkspaceSchema } from '../schemas.js';

interface Env {
  API: any;
}

export const workspaces = new OpenAPIHono<{ Bindings: Env }>();

const createWorkspaceRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkspaceSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: WorkspaceSchema,
        },
      },
      description: 'Workspace created successfully',
    },
  },
});

workspaces.openapi(createWorkspaceRoute, async (c) => {
  const validated = c.req.valid('json');
  using workspaces = c.env.API.workspaces();
  const result = await workspaces.create(validated);
  return c.json(result, 201);
});

const getWorkspaceRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' }, example: '550e8400-e29b-41d4-a716-446655440000' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: WorkspaceSchema,
        },
      },
      description: 'Workspace retrieved successfully',
    },
  },
});

workspaces.openapi(getWorkspaceRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workspaces = c.env.API.workspaces();
  const result = await workspaces.get(id);
  return c.json(result);
});

const deleteWorkspaceRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Workspace deleted successfully',
    },
  },
});

workspaces.openapi(deleteWorkspaceRoute, async (c) => {
  const { id } = c.req.valid('param');
  using workspaces = c.env.API.workspaces();
  await workspaces.delete(id);
  return c.json({ success: true });
});
