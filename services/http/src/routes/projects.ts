import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
    CreateProjectSchema,
    ProjectCreateResponseSchema,
    ProjectGetResponseSchema,
    ulid,
} from '../schemas.js';

interface Env {
  API: any;
}

export const projects = new OpenAPIHono<{ Bindings: Env }>();

const createProjectRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['projects'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProjectSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ProjectCreateResponseSchema,
        },
      },
      description: 'Project created successfully',
    },
  },
});

projects.openapi(createProjectRoute, async (c) => {
  const validated = c.req.valid('json');
  using projects = c.env.API.projects();
  const result = await projects.create(validated);
  return c.json(result, 201);
});

const getProjectRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['projects'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ProjectGetResponseSchema,
        },
      },
      description: 'Project retrieved successfully',
    },
  },
});

projects.openapi(getProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  using projects = c.env.API.projects();
  const result = await projects.get(id);
  return c.json(result);
});

const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['projects'],
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
      description: 'Project deleted successfully',
    },
  },
});

projects.openapi(deleteProjectRoute, async (c) => {
  const { id } = c.req.valid('param');
  using projects = c.env.API.projects();
  await projects.delete(id);
  return c.json({ success: true });
});
