import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  CreateMessageSchema,
  MessageCreateResponseSchema,
  MessageGetResponseSchema,
  MessageListResponseSchema,
} from './schema';

export const createMessageRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['messages'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateMessageSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: MessageCreateResponseSchema,
        },
      },
      description: 'Message created successfully',
    },
  },
});

export const getMessageRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['messages'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageGetResponseSchema,
        },
      },
      description: 'Message retrieved successfully',
    },
  },
});

export const deleteMessageRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['messages'],
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
      description: 'Message deleted successfully',
    },
  },
});

export const listMessagesForConversationRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['messages'],
  request: {
    params: z.object({
      conversationId: ulid().openapi({ param: { name: 'conversationId', in: 'path' } }),
    }),
    query: z.object({
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageListResponseSchema,
        },
      },
      description: 'Messages retrieved successfully',
    },
  },
});

export const listMessagesForTurnRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['messages'],
  request: {
    params: z.object({
      conversationId: ulid().openapi({ param: { name: 'conversationId', in: 'path' } }),
      turnId: ulid().openapi({ param: { name: 'turnId', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageListResponseSchema,
        },
      },
      description: 'Messages for turn retrieved successfully',
    },
  },
});
