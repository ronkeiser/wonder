import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

export const logs = new OpenAPIHono<{ Bindings: Env }>();

const getLogsRoute = createRoute({
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
          schema: z.array(
            z.object({
              id: z.string(),
              timestamp: z.number(),
              level: z.string(),
              service: z.string(),
              environment: z.string(),
              event_type: z.string().nullable(),
              message: z.string().nullable(),
              source_location: z.string().nullable(),
              trace_id: z.string().nullable(),
              request_id: z.string().nullable(),
              workspace_id: z.string().nullable(),
              project_id: z.string().nullable(),
              user_id: z.string().nullable(),
              version: z.string().nullable(),
              instance_id: z.string().nullable(),
              metadata: z.string(),
            }),
          ),
        },
      },
      description: 'Logs retrieved successfully',
    },
  },
});

logs.openapi(getLogsRoute, async (c) => {
  const query = c.req.valid('query');
  const result = await c.env.LOGS.getLogs(query);
  return c.json(result.logs);
});
