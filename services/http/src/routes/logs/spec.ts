/**
 * Log OpenAPI Route Specifications
 */

import { createRoute, z } from '@hono/zod-openapi';
import { LogsResponseSchema } from './schema';

export const getLogsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['logs'],
  request: {
    query: z.object({
      service: z.string().optional(),
      level: z.enum(['error', 'warn', 'info', 'debug', 'fatal']).optional(),
      event_type: z.string().optional(),
      trace_id: z.string().optional(),
      request_id: z.string().optional(),
      workspace_id: z.string().optional(),
      project_id: z.string().optional(),
      user_id: z.string().optional(),
      limit: z.coerce.number().int().positive().max(1000).optional().default(100),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: LogsResponseSchema,
        },
      },
      description: 'Logs retrieved successfully',
    },
  },
});
