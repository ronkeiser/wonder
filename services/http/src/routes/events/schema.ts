/**
 * Event OpenAPI Schemas
 */

import { z } from '@hono/zod-openapi';

export const EventEntrySchema = z
  .object({
    id: z.string(),
    timestamp: z.number(),
    sequence: z.number(),
    event_type: z.string(),
    workflow_run_id: z.string(),
    parent_run_id: z.string().nullable().optional(),
    workflow_def_id: z.string(),
    node_id: z.string().nullable().optional(),
    token_id: z.string().nullable().optional(),
    path_id: z.string().nullable().optional(),
    project_id: z.string(),
    tokens: z.number().nullable().optional(),
    cost_usd: z.number().nullable().optional(),
    message: z.string().nullable().optional(),
    metadata: z.string(),
  })
  .openapi('EventEntry');

export const EventsResponseSchema = z
  .object({
    events: z.array(EventEntrySchema),
  })
  .openapi('EventsResponse');

/**
 * Generic trace event payload schema
 *
 * Trace events use a generic payload structure rather than discriminated unions.
 * The `type` field follows the convention: {category}.{domain}.{action}
 * e.g., 'decision.routing.start', 'operation.tokens.created', 'sql.query'
 */
const TraceEventPayloadSchema = z.record(z.string(), z.unknown()).openapi('TraceEventPayload');

export const TraceEventEntrySchema = z
  .object({
    id: z.string(),
    sequence: z.number(),
    timestamp: z.number(),
    type: z.string().describe('Event type following {category}.{domain}.{action} convention'),
    category: z.enum(['decision', 'operation', 'dispatch', 'sql', 'debug']),
    workflow_run_id: z.string(),
    token_id: z.string().nullable(),
    node_id: z.string().nullable(),
    project_id: z.string(),
    duration_ms: z.number().nullable(),
    payload: TraceEventPayloadSchema,
  })
  .openapi('TraceEventEntry');

export const TraceEventsResponseSchema = z
  .object({
    events: z.array(TraceEventEntrySchema),
  })
  .openapi('TraceEventsResponse');
