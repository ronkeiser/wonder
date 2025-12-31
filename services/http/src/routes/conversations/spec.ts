import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import {
  ConversationCreateResponseSchema,
  ConversationGetResponseSchema,
  ConversationListResponseSchema,
  CreateConversationSchema,
  UpdateConversationStatusSchema,
} from './schema';

export const createConversationRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['conversations'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateConversationSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ConversationCreateResponseSchema,
        },
      },
      description: 'Conversation created successfully',
    },
  },
});

export const listConversationsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['conversations'],
  request: {
    query: z.object({
      status: z.enum(['active', 'waiting', 'completed', 'failed']).optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ConversationListResponseSchema,
        },
      },
      description: 'Conversations retrieved successfully',
    },
  },
});

export const getConversationRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['conversations'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ConversationGetResponseSchema,
        },
      },
      description: 'Conversation retrieved successfully',
    },
  },
});

export const updateConversationStatusRoute = createRoute({
  method: 'patch',
  path: '/{id}/status',
  tags: ['conversations'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateConversationStatusSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ConversationGetResponseSchema,
        },
      },
      description: 'Conversation status updated successfully',
    },
  },
});

export const deleteConversationRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['conversations'],
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
      description: 'Conversation deleted successfully',
    },
  },
});
