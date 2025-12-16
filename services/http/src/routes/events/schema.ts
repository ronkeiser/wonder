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

// Trace event payload schemas - matches TraceEventInput from @wonder/events
const TraceEventPayloadSchema = z.discriminatedUnion('type', [
  // Decision events - routing
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
  // Decision events - sync
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
  z.object({
    type: z.literal('decision.sync.sibling_group_check'),
    token_fan_out_transition_id: z.string().nullable(),
    sync_sibling_group: z.string(),
    matches: z.boolean(),
  }),
  z.object({
    type: z.literal('decision.sync.skipped_wrong_sibling_group'),
    token_fan_out_transition_id: z.string().nullable(),
    sync_sibling_group: z.string(),
  }),
  // Decision events - lifecycle
  z.object({
    type: z.literal('decision.lifecycle.start'),
    workflow_run_id: z.string(),
    initial_node_id: z.string(),
  }),
  z.object({
    type: z.literal('decision.lifecycle.root_token_planned'),
    node_id: z.string(),
  }),
  z.object({
    type: z.literal('decision.sync.continuation'),
    workflow_run_id: z.string(),
    node_id: z.string(),
    fan_in_path: z.string(),
  }),
  // Decision events - completion
  z.object({
    type: z.literal('decision.completion.start'),
    output_mapping: z.record(z.string(), z.string()).nullable(),
    context_keys: z.object({
      input: z.array(z.string()),
      state: z.array(z.string()),
      output: z.array(z.string()),
    }),
  }),
  z.object({
    type: z.literal('decision.completion.no_mapping'),
  }),
  z.object({
    type: z.literal('decision.completion.extract'),
    target_field: z.string(),
    source_path: z.string(),
    extracted_value: z.unknown(),
  }),
  z.object({
    type: z.literal('decision.completion.complete'),
    final_output: z.record(z.string(), z.unknown()),
  }),
  // Operation events - context
  z.object({
    type: z.literal('operation.context.initialized'),
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
    type: z.literal('operation.context.section_replaced'),
    section: z.string(),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal('operation.context.field_set'),
    path: z.string(),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('operation.context.snapshot'),
    snapshot: z.object({
      input: z.unknown(),
      state: z.unknown(),
      output: z.unknown(),
    }),
  }),
  z.object({
    type: z.literal('operation.context.output_mapping.started'),
    output_mapping: z.record(z.string(), z.string()).nullable(),
    task_output_keys: z.array(z.string()),
  }),
  z.object({
    type: z.literal('operation.context.output_mapping.skipped'),
    reason: z.literal('no_mapping'),
  }),
  z.object({
    type: z.literal('operation.context.output_mapping.applied'),
    target_path: z.string(),
    source_path: z.string(),
    extracted_value: z.unknown(),
  }),
  z.object({
    type: z.literal('operation.context.branch_table.created'),
    token_id: z.string(),
    table_name: z.string(),
    schema_type: z.string(),
  }),
  z.object({
    type: z.literal('operation.context.branch_table.dropped'),
    token_ids: z.array(z.string()),
    tables_dropped: z.number(),
  }),
  z.object({
    type: z.literal('operation.context.branch.validate'),
    token_id: z.string(),
    valid: z.boolean(),
    error_count: z.number(),
    errors: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('operation.context.branch.written'),
    token_id: z.string(),
    output: z.unknown(),
  }),
  z.object({
    type: z.literal('operation.context.branches_read'),
    token_ids: z.array(z.string()),
    output_count: z.number(),
  }),
  z.object({
    type: z.literal('operation.context.merge.started'),
    sibling_count: z.number(),
    strategy: z.string(),
    source_path: z.string(),
    target_path: z.string(),
  }),
  z.object({
    type: z.literal('operation.context.merged'),
    target_path: z.string(),
    branch_count: z.number(),
  }),
  // Operation events - tokens
  z.object({
    type: z.literal('operation.tokens.created'),
    token_id: z.string(),
    node_id: z.string(),
    task_id: z.string(),
    parent_token_id: z.string().nullable(),
    fan_out_transition_id: z.string().nullable(),
    branch_index: z.number(),
    branch_total: z.number(),
  }),
  z.object({
    type: z.literal('operation.tokens.status_updated'),
    token_id: z.string(),
    node_id: z.string().optional(),
    from: z.string(),
    to: z.string(),
  }),
  // Operation events - metadata
  z.object({
    type: z.literal('operation.metadata.table_init'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('operation.metadata.table_init_error'),
    message: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal('operation.metadata.cache_hit'),
    resource: z.enum(['workflow_run', 'workflow_def']),
    level: z.enum(['memory', 'sql']),
    workflow_run_id: z.string().optional(),
    workflow_def_id: z.string().optional(),
  }),
  z.object({
    type: z.literal('operation.metadata.cache_miss'),
    resource: z.enum(['workflow_run', 'workflow_def']),
    workflow_run_id: z.string(),
  }),
  z.object({
    type: z.literal('operation.metadata.fetch_start'),
    workflow_run_id: z.string(),
  }),
  z.object({
    type: z.literal('operation.metadata.fetch_success'),
    workflow_run_id: z.string(),
    workflow_def_id: z.string(),
    duration_ms: z.number(),
  }),
  z.object({
    type: z.literal('operation.metadata.fetch_error'),
    workflow_run_id: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal('operation.metadata.save'),
    workflow_run_id: z.string(),
    workflow_def_id: z.string(),
  }),
  // SQL events
  z.object({
    type: z.literal('sql.query'),
    sql: z.string(),
    params: z.array(z.unknown()),
    duration_ms: z.number(),
  }),
  // Dispatch events - batching
  z.object({
    type: z.literal('dispatch.batch.start'),
    decision_count: z.number(),
  }),
  z.object({
    type: z.literal('dispatch.batch.complete'),
    total_decisions: z.number(),
    batched_decisions: z.number(),
    applied: z.number(),
    tokens_created: z.number(),
    tokens_dispatched: z.number(),
    errors: z.number(),
    duration_ms: z.number().optional(),
  }),
  // Dispatch events - decision tracking
  z.object({
    type: z.literal('dispatch.decision.planned'),
    decision_type: z.string(),
    source: z.string(),
    token_id: z.string().optional(),
    timestamp: z.number(),
  }),
  // Dispatch events - error handling
  z.object({
    type: z.literal('dispatch.error'),
    decision_type: z.string(),
    error: z.string(),
  }),
  // Dispatch events - synchronization
  z.object({
    type: z.literal('dispatch.sync.fan_in_activated'),
    node_id: z.string(),
    fan_in_path: z.string(),
    merged_count: z.number(),
  }),
  // Dispatch events - workflow lifecycle
  z.object({
    type: z.literal('dispatch.workflow.completed'),
    has_output: z.boolean(),
  }),
  z.object({
    type: z.literal('dispatch.workflow.failed'),
    error: z.string(),
  }),
  // Debug events - fan-in debugging
  z.object({
    type: z.literal('debug.fan_in.start'),
    workflow_run_id: z.string(),
    node_id: z.string(),
    fan_in_path: z.string(),
  }),
  z.object({
    type: z.literal('debug.fan_in.try_activate_result'),
    activated: z.boolean(),
  }),
]);

export const TraceEventEntrySchema = z
  .object({
    id: z.string(),
    sequence: z.number(),
    timestamp: z.number(),
    type: z.string(),
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
