import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { CreatePromptSpecSchema, PromptSpecSchema } from '../schemas.js';

interface Env {
  API: any;
}

export const promptSpecs = new OpenAPIHono<{ Bindings: Env }>();

const createPromptSpecRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePromptSpecSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: PromptSpecSchema,
        },
      },
      description: 'Prompt spec created successfully',
    },
  },
});

promptSpecs.openapi(createPromptSpecRoute, async (c) => {
  const validated = c.req.valid('json');
  using promptSpecs = c.env.API.promptSpecs();
  const result = await promptSpecs.create(validated);
  return c.json(result, 201);
});

const getPromptSpecRoute = createRoute({
  method: 'get',
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
          schema: PromptSpecSchema,
        },
      },
      description: 'Prompt spec retrieved successfully',
    },
  },
});

promptSpecs.openapi(getPromptSpecRoute, async (c) => {
  const { id } = c.req.valid('param');
  using promptSpecs = c.env.API.promptSpecs();
  const result = await promptSpecs.get(id);
  return c.json(result);
});
