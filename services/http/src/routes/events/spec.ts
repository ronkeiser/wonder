/**
 * Event OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { EventsResponseSchema, TraceEventsResponseSchema } from './schema';

export const getEventsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['events'],
  summary: 'Get workflow events',
  request: {
    query: z.object({
      workflowRunId: z.string().optional(),
      parentRunId: z.string().optional(),
      projectId: z.string().optional(),
      eventType: z.string().optional(),
      nodeId: z.string().optional(),
      tokenId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(10000).optional().default(100),
      afterSequence: z.coerce.number().int().nonnegative().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: EventsResponseSchema,
        },
      },
      description: 'Workflow events retrieved successfully',
    },
  },
});

export const getTraceEventsRoute = createRoute({
  method: 'get',
  path: '/trace',
  tags: ['events'],
  summary: 'Get trace events',
  request: {
    query: z.object({
      workflowRunId: z.string().optional(),
      tokenId: z.string().optional(),
      nodeId: z.string().optional(),
      type: z.string().optional(),
      category: z.enum(['decision', 'operation', 'dispatch', 'sql']).optional(),
      projectId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(10000).optional().default(1000),
      minDurationMs: z.coerce.number().nonnegative().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: TraceEventsResponseSchema,
        },
      },
      description: 'Trace events retrieved successfully',
    },
  },
});
