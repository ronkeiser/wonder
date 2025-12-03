/**
 * Action Zod Schemas
 */

import { z } from '@hono/zod-openapi';

export const CreateActionSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Generate Summary' }),
    description: z.string().min(1).openapi({ example: 'Generates a summary using LLM' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    kind: z
      .enum([
        'llm_call',
        'mcp_tool',
        'http_request',
        'human_input',
        'update_context',
        'write_artifact',
        'workflow_call',
        'vector_search',
        'emit_metric',
      ])
      .openapi({ example: 'llm_call' }),
    implementation: z.record(z.string(), z.unknown()).openapi({ example: { model: 'gpt-4' } }),
    requires: z.record(z.string(), z.unknown()).optional(),
    produces: z.record(z.string(), z.unknown()).optional(),
    execution: z.record(z.string(), z.unknown()).optional(),
    idempotency: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('CreateAction');

export const ActionSchema = z
  .object({
    id: z.string().openapi({ example: 'send-email' }),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    kind: z.enum([
      'llm_call',
      'mcp_tool',
      'http_request',
      'human_input',
      'update_context',
      'write_artifact',
      'workflow_call',
      'vector_search',
      'emit_metric',
    ]),
    implementation: z.record(z.string(), z.unknown()),
    requires: z.record(z.string(), z.unknown()).nullable(),
    produces: z.record(z.string(), z.unknown()).nullable(),
    execution: z.record(z.string(), z.unknown()).nullable(),
    idempotency: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Action');

export const ActionCreateResponseSchema = z
  .object({
    action_id: z.string(),
    action: ActionSchema,
  })
  .openapi('ActionCreateResponse');

export const ActionGetResponseSchema = z
  .object({
    action: ActionSchema,
  })
  .openapi('ActionGetResponse');
