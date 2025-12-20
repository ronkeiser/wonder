/**
 * Log Zod Schemas
 */

import { z } from '@hono/zod-openapi';

export const LogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  level: z.string(),
  service: z.string(),
  environment: z.string(),
  eventType: z.string().nullable(),
  message: z.string().nullable(),
  sourceLocation: z.string().nullable(),
  traceId: z.string().nullable(),
  requestId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  projectId: z.string().nullable(),
  userId: z.string().nullable(),
  version: z.string().nullable(),
  instanceId: z.string().nullable(),
  metadata: z.string(),
});

export const LogsResponseSchema = z.object({
  logs: z.array(LogEntrySchema),
});
