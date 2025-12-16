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
      workflow_run_id: z.string().optional(),
      parent_run_id: z.string().optional(),
      project_id: z.string().optional(),
      event_type: z.string().optional(),
      node_id: z.string().optional(),
      token_id: z.string().optional(),
      limit: z.coerce.number().int().positive().max(10000).optional().default(100),
      after_sequence: z.coerce.number().int().nonnegative().optional(),
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
      workflow_run_id: z.string().optional(),
      token_id: z.string().optional(),
      node_id: z.string().optional(),
      type: z.string().optional(),
      category: z.enum(['decision', 'operation', 'dispatch', 'sql']).optional(),
      project_id: z.string().optional(),
      limit: z.coerce.number().int().positive().max(10000).optional().default(1000),
      min_duration_ms: z.coerce.number().nonnegative().optional(),
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
