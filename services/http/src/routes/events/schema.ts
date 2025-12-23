/**
 * Event OpenAPI Schemas
 */

import { z } from '@hono/zod-openapi';

export const EventEntrySchema = z
  .object({
    id: z.string(),
    timestamp: z.number(),
    sequence: z.number(),
    eventType: z.string(),
    workflowRunId: z.string(),
    rootRunId: z.string(),
    workflowDefId: z.string(),
    nodeId: z.string().nullable().optional(),
    tokenId: z.string().nullable().optional(),
    pathId: z.string().nullable().optional(),
    projectId: z.string(),
    tokens: z.number().nullable().optional(),
    costUsd: z.number().nullable().optional(),
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
    workflowRunId: z.string(),
    rootRunId: z.string(),
    tokenId: z.string().nullable(),
    nodeId: z.string().nullable(),
    projectId: z.string(),
    durationMs: z.number().nullable(),
    payload: TraceEventPayloadSchema,
  })
  .openapi('TraceEventEntry');

export const TraceEventsResponseSchema = z
  .object({
    events: z.array(TraceEventEntrySchema),
  })
  .openapi('TraceEventsResponse');
