/**
 * Workflow Definition Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateWorkflowDefSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Content Generation Pipeline' }),
    description: z.string().min(1).openapi({ example: 'Generates and reviews content' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    project_id: ulid().optional().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    library_id: ulid().optional(),
    tags: z.array(z.string()).optional(),
    input_schema: z.record(z.string(), z.unknown()).openapi({ example: { topic: 'string' } }),
    output_schema: z.record(z.string(), z.unknown()).openapi({ example: { content: 'string' } }),
    output_mapping: z
      .record(z.string(), z.string())
      .optional()
      .openapi({ example: { result: '$.final_node_output.response' } }),
    context_schema: z.record(z.string(), z.unknown()).optional(),
    initial_node_ref: z
      .string()
      .min(1)
      .regex(/^[a-z_][a-z0-9_]*$/)
      .openapi({ example: 'start_node' }),
    nodes: z.array(
      z.object({
        ref: z
          .string()
          .min(1)
          .regex(/^[a-z_][a-z0-9_]*$/)
          .openapi({ example: 'llm_call_node' }),
        name: z.string().min(1),
        action_id: z.string().min(1).openapi({ example: 'send-email' }),
        action_version: z.number().int().positive().openapi({ example: 1 }),
        input_mapping: z.record(z.string(), z.unknown()).optional(),
        output_mapping: z.record(z.string(), z.unknown()).optional(),
        fan_out: z.enum(['first_match', 'all']).optional(),
        fan_in: z.string().optional().openapi({ example: 'any' }),
        joins_node_ref: z.string().optional(),
        merge: z.record(z.string(), z.unknown()).optional(),
        on_early_complete: z.enum(['cancel', 'abandon', 'allow_late_merge']).optional(),
      }),
    ),
    transitions: z
      .array(
        z.object({
          ref: z
            .string()
            .regex(/^[a-z_][a-z0-9_]*$/)
            .optional(),
          from_node_ref: z.string().min(1),
          to_node_ref: z.string().min(1),
          priority: z.number().int(),
          condition: z.record(z.string(), z.unknown()).optional(),
          foreach: z.record(z.string(), z.unknown()).optional(),
          loop_config: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
  })
  .openapi('CreateWorkflowDef');

export const NodeSchema = z
  .object({
    id: ulid(),
    workflow_def_id: ulid(),
    workflow_def_version: z.number().int(),
    ref: z.string(),
    name: z.string(),
    action_id: z.string(),
    action_version: z.number().int(),
    input_mapping: z.record(z.string(), z.unknown()).nullable(),
    output_mapping: z.record(z.string(), z.unknown()).nullable(),
    fan_out: z.enum(['first_match', 'all']),
    fan_in: z.union([z.literal('any'), z.literal('all'), z.string()]),
    joins_node: z.string().nullable(),
    merge: z.record(z.string(), z.unknown()).nullable(),
    on_early_complete: z.enum(['cancel', 'abandon', 'allow_late_merge']).nullable(),
  })
  .openapi('Node');

export const TransitionSchema = z
  .object({
    id: ulid(),
    workflow_def_id: ulid(),
    workflow_def_version: z.number().int(),
    ref: z.string().nullable(),
    from_node_id: z.string(),
    to_node_id: z.string(),
    priority: z.number().int(),
    condition: z.record(z.string(), z.unknown()).nullable(),
    foreach: z.record(z.string(), z.unknown()).nullable(),
    loop_config: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('Transition');

export const WorkflowDefSchema = z
  .object({
    id: ulid(),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    project_id: ulid().nullable(),
    library_id: ulid().nullable(),
    tags: z.array(z.string()).nullable(),
    input_schema: z.record(z.string(), z.unknown()),
    output_schema: z.record(z.string(), z.unknown()),
    context_schema: z.record(z.string(), z.unknown()).nullable(),
    initial_node_id: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('WorkflowDef');

export const WorkflowDefCreateResponseSchema = z
  .object({
    workflow_def_id: ulid(),
    workflow_def: WorkflowDefSchema,
  })
  .openapi('WorkflowDefCreateResponse');

export const WorkflowDefGetResponseSchema = z
  .object({
    workflow_def: WorkflowDefSchema,
    nodes: z.array(NodeSchema),
    transitions: z.array(TransitionSchema),
  })
  .openapi('WorkflowDefGetResponse');
