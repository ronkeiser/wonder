import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import { MessageListResponseSchema } from './schema';

/**
 * List messages for a conversation.
 * GET /conversations/:conversationId/messages
 */
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

/**
 * List messages for a specific turn.
 * GET /conversations/:conversationId/turns/:turnId/messages
 */
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
