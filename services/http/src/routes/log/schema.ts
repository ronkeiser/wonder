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
});

export const LogsResponseSchema = z.array(LogEntrySchema);
