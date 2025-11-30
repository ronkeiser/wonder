import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
    CreatePromptSpecSchema,
    PromptSpecCreateResponseSchema,
    PromptSpecGetResponseSchema,
} from '../schemas.js';

interface Env {
  API: any;
}

export const promptSpecs = new OpenAPIHono<{ Bindings: Env }>();

const createPromptSpecRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['prompt-specs'],
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
          schema: PromptSpecCreateResponseSchema,
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
  tags: ['prompt-specs'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' }, example: 'summarize-text' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PromptSpecGetResponseSchema,
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

const deletePromptSpecRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['prompt-specs'],
  request: {
    params: z.object({
      id: z.string().min(1).openapi({ param: { name: 'id', in: 'path' }, example: 'summarize-text' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: 'Prompt spec deleted successfully',
    },
  },
});

promptSpecs.openapi(deletePromptSpecRoute, async (c) => {
  const { id } = c.req.valid('param');
  using promptSpecs = c.env.API.promptSpecs();
  await promptSpecs.delete(id);
  return c.json({ success: true });
});
