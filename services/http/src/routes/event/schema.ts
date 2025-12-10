/**
 * Event OpenAPI Schemas
 */

import { z } from '@hono/zod-openapi';

export const EventEntrySchema = z
  .object({
    id: z.string(),
    timestamp: z.number(),
    sequence_number: z.number(),
    event_type: z.string(),
    workflow_run_id: z.string(),
    parent_run_id: z.string().nullable(),
    workflow_def_id: z.string(),
    node_id: z.string().nullable(),
    token_id: z.string().nullable(),
    path_id: z.string().nullable(),
    workspace_id: z.string(),
    project_id: z.string(),
    tokens: z.number().nullable(),
    cost_usd: z.number().nullable(),
    message: z.string().nullable(),
    metadata: z.string(),
  })
  .openapi('EventEntry');

export const EventsResponseSchema = z
  .object({
    events: z.array(EventEntrySchema),
  })
  .openapi('EventsResponse');

export const TraceEventEntrySchema = z
  .object({
    id: z.string(),
    sequence: z.number(),
    timestamp: z.number(),
    type: z.string(),
    category: z.enum(['decision', 'operation', 'dispatch', 'sql']),
    workflow_run_id: z.string(),
    token_id: z.string().nullable(),
    node_id: z.string().nullable(),
    workspace_id: z.string(),
    project_id: z.string(),
    duration_ms: z.number().nullable(),
    payload: z.string(),
  })
  .openapi('TraceEventEntry');

export const TraceEventsResponseSchema = z
  .object({
    events: z.array(TraceEventEntrySchema),
  })
  .openapi('TraceEventsResponse');
