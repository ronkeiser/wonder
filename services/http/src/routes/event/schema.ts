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
    workspace_id: z.string(),
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

// Trace event payload schemas
const TraceEventPayloadSchema = z.discriminatedUnion('type', [
  // Decision events
  z.object({
    type: z.literal('decision.routing.start'),
    token_id: z.string(),
    node_id: z.string(),
  }),
  z.object({
    type: z.literal('decision.routing.evaluate_transition'),
    transition_id: z.string(),
    condition: z.unknown(),
  }),
  z.object({
    type: z.literal('decision.routing.transition_matched'),
    transition_id: z.string(),
    spawn_count: z.number(),
  }),
  z.object({
    type: z.literal('decision.routing.complete'),
    decisions: z.array(z.unknown()),
  }),
  z.object({
    type: z.literal('decision.sync.start'),
    token_id: z.string(),
    sibling_count: z.number(),
  }),
  z.object({
    type: z.literal('decision.sync.check_condition'),
    strategy: z.string(),
    completed: z.number(),
    required: z.number(),
  }),
  z.object({
    type: z.literal('decision.sync.wait'),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('decision.sync.activate'),
    merge_config: z.unknown(),
  }),
  // Operation events - context
  z.object({
    type: z.literal('operation.context.initialize'),
    has_input_schema: z.boolean(),
    has_context_schema: z.boolean(),
    table_count: z.number(),
    tables_created: z.array(z.string()),
  }),
  z.object({
    type: z.literal('operation.context.validate'),
    path: z.string(),
    schema_type: z.string(),
    valid: z.boolean(),
    error_count: z.number(),
    errors: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('operation.context.read'),
    path: z.string(),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('operation.context.write'),
    path: z.string(),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('operation.context.branch_table.create'),
    token_id: z.string(),
    table_name: z.string(),
    schema_type: z.string(),
  }),
  z.object({
    type: z.literal('operation.context.branch_table.drop'),
    table_name: z.string(),
  }),
  z.object({
    type: z.literal('operation.context.merge.start'),
    sibling_count: z.number(),
    strategy: z.string(),
    source_path: z.string(),
    target_path: z.string(),
  }),
  z.object({
    type: z.literal('operation.context.merge.complete'),
    target_path: z.string(),
    rows_written: z.number(),
  }),
  // Operation events - tokens
  z.object({
    type: z.literal('operation.tokens.create'),
    token_id: z.string(),
    node_id: z.string(),
    task_id: z.string(),
    parent_token_id: z.string().nullable(),
  }),
  z.object({
    type: z.literal('operation.tokens.update_status'),
    token_id: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  // SQL events
  z.object({
    type: z.literal('operation.sql.query'),
    sql: z.string(),
    params: z.array(z.unknown()),
    duration_ms: z.number(),
  }),
  // Dispatch events
  z.object({
    type: z.literal('dispatch.batch.start'),
    decision_count: z.number(),
  }),
  z.object({
    type: z.literal('dispatch.batch.group'),
    batch_type: z.string(),
    count: z.number(),
  }),
  z.object({
    type: z.literal('dispatch.decision.apply'),
    decision_type: z.string(),
    decision: z.unknown(),
  }),
]);

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
    payload: TraceEventPayloadSchema,
  })
  .openapi('TraceEventEntry');

export const TraceEventsResponseSchema = z
  .object({
    events: z.array(TraceEventEntrySchema),
  })
  .openapi('TraceEventsResponse');
