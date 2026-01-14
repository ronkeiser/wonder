import { createRoute, z } from '@hono/zod-openapi';
import { ulid } from '../../validators';
import { EventEntrySchema, TraceEventEntrySchema } from '../events/schema';
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

/**
 * SSE event envelope for conversation streaming
 */
const ConversationSSEEventSchema = z
  .object({
    stream: z.enum(['events', 'trace']).openapi({
      description: 'Which event stream this belongs to',
    }),
    event: z.union([EventEntrySchema, TraceEventEntrySchema]).openapi({
      description: 'The event payload',
    }),
  })
  .openapi('ConversationSSEEvent');

const StartTurnRequestSchema = z
  .object({
    stream: z.boolean().optional().openapi({
      description: 'If true, returns SSE stream of events instead of JSON response',
      example: false,
    }),
    content: z.string().openapi({
      description: 'The user message content',
      example: 'Hello, how are you?',
    }),
    enableTraceEvents: z.boolean().optional().openapi({
      description: 'If true, enables trace event emission (for testing)',
      example: false,
    }),
  })
  .openapi('StartTurnRequest');

export const startTurnRoute = createRoute({
  method: 'post',
  path: '/{id}/turns',
  tags: ['conversations'],
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: StartTurnRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z
            .object({
              turnId: ulid(),
              conversationId: ulid(),
            })
            .openapi('StartTurnResponse'),
        },
        'text/event-stream': {
          schema: ConversationSSEEventSchema,
        },
      },
      description: 'Turn started successfully',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }).openapi('StartTurnError'),
        },
      },
      description: 'Failed to start turn',
    },
  },
});

/**
 * WebSocket message schema for sending turns
 */
export const WebSocketSendMessageSchema = z
  .object({
    type: z.literal('send').openapi({
      description: 'Message type for sending a turn',
    }),
    content: z.string().openapi({
      description: 'The user message content',
      example: 'Hello, how are you?',
    }),
    enableTraceEvents: z.boolean().optional().openapi({
      description: 'If true, enables trace event emission',
      example: true,
    }),
  })
  .openapi('WebSocketSendMessage');

/**
 * WebSocket connect route - upgrades HTTP to WebSocket for real-time events
 *
 * Note: This route uses Hono's raw routing since OpenAPI doesn't support WebSocket.
 * The schema is documented here for reference.
 */
export const connectWebSocketRoute = createRoute({
  method: 'get',
  path: '/{id}/ws',
  tags: ['conversations'],
  description:
    'WebSocket connection for real-time conversation events. Supports bidirectional communication - send messages as turns and receive all conversation events.',
  request: {
    params: z.object({
      id: ulid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
    query: z.object({
      enableTraceEvents: z
        .string()
        .optional()
        .transform((v) => v === 'true')
        .openapi({
          description: 'If true, enables trace event emission for all turns',
          example: 'true',
        }),
      apiKey: z
        .string()
        .optional()
        .openapi({
          description: 'API key for authentication (WebSocket cannot use headers)',
        }),
    }),
  },
  responses: {
    101: {
      description: 'WebSocket upgrade successful',
    },
    426: {
      description: 'Upgrade required - WebSocket expected',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});
