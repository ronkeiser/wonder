/**
 * Event OpenAPI Schemas
 */

import { z } from '@hono/zod-openapi';

export const EventEntrySchema = z
  .object({
    id: z.string(),
    timestamp: z.number(),
    sequence: z.number(),
    streamId: z.string().describe('Outer execution boundary (conversationId or rootRunId)'),
    executionId: z.string().describe('Specific execution (workflowRunId, turnId, etc.)'),
    executionType: z.string().describe('Execution type: workflow, conversation, etc.'),
    eventType: z.string(),
    projectId: z.string(),
    message: z.string().nullable().optional(),
    metadata: z.string().describe('JSON blob with all domain-specific fields'),
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
    category: z.string().describe('Event category extracted from type prefix'),
    streamId: z.string().describe('Outer execution boundary (conversationId or rootRunId)'),
    executionId: z.string().describe('Specific execution (workflowRunId, turnId, etc.)'),
    executionType: z.string().describe('Execution type: workflow, conversation, etc.'),
    projectId: z.string(),
    durationMs: z.number().nullable(),
    payload: TraceEventPayloadSchema.describe('Contains domain-specific fields including tokenId, nodeId'),
  })
  .openapi('TraceEventEntry');

export const TraceEventsResponseSchema = z
  .object({
    events: z.array(TraceEventEntrySchema),
  })
  .openapi('TraceEventsResponse');
