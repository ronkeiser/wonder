import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { CreateWorkspaceSchema, ulid, WorkspaceSchema } from '../schemas.js';

interface Env {
  API: any;
}

export const workspaces = new OpenAPIHono<{ Bindings: Env }>();

const createWorkspaceRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['workspaces'],
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
  return c.json(result.workspace, 201);
});

const getWorkspaceRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['workspaces'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' }, example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
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
  tags: ['workspaces'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
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
