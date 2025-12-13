/**
 * TaskDef Zod Schemas
 */

import { z } from '@hono/zod-openapi';

/** Step schema (embedded in TaskDef) */
export const StepSchema = z
  .object({
    id: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    ref: z.string().min(1).openapi({ example: 'call_llm' }),
    ordinal: z.number().int().min(0).openapi({ example: 0 }),
    action_id: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    action_version: z.number().int().positive().openapi({ example: 1 }),
    input_mapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .openapi({
        example: { prompt: '$.input.prompt' },
      }),
    output_mapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .openapi({
        example: { response: '$.result.text' },
      }),
    on_failure: z
      .enum(['abort', 'retry', 'continue'])
      .default('abort')
      .openapi({ example: 'abort' }),
    condition: z
      .object({
        if: z.string(),
        then: z.enum(['continue', 'skip', 'succeed', 'fail']),
        else: z.enum(['continue', 'skip', 'succeed', 'fail']),
      })
      .nullable()
      .optional(),
  })
  .openapi('Step');

/** Retry configuration schema */
export const RetryConfigSchema = z
  .object({
    max_attempts: z.number().int().positive().openapi({ example: 3 }),
    backoff: z.enum(['none', 'linear', 'exponential']).openapi({ example: 'exponential' }),
    initial_delay_ms: z.number().int().positive().openapi({ example: 1000 }),
    max_delay_ms: z.number().int().positive().nullable().openapi({ example: 30000 }),
  })
  .openapi('RetryConfig');

/** Create step input (without id, which is auto-generated) */
export const CreateStepSchema = z
  .object({
    ref: z.string().min(1).openapi({ example: 'call_llm' }),
    ordinal: z.number().int().min(0).openapi({ example: 0 }),
    action_id: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    action_version: z.number().int().positive().openapi({ example: 1 }),
    input_mapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .default(null)
      .openapi({
        example: { prompt: '$.input.prompt' },
      }),
    output_mapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .default(null)
      .openapi({
        example: { response: '$.result.text' },
      }),
    on_failure: z
      .enum(['abort', 'retry', 'continue'])
      .default('abort')
      .openapi({ example: 'abort' }),
    condition: z
      .object({
        if: z.string(),
        then: z.enum(['continue', 'skip', 'succeed', 'fail']),
        else: z.enum(['continue', 'skip', 'succeed', 'fail']),
      })
      .nullable()
      .default(null),
  })
  .openapi('CreateStep');

export const CreateTaskDefSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Write File Verified' }),
    description: z
      .string()
      .optional()
      .openapi({ example: 'Write file with read-back verification' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    project_id: z.string().optional().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    library_id: z.string().optional(),
    tags: z.array(z.string()).optional(),
    input_schema: z.record(z.string(), z.unknown()).openapi({
      example: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
      },
    }),
    output_schema: z.record(z.string(), z.unknown()).openapi({
      example: { type: 'object', properties: { success: { type: 'boolean' } } },
    }),
    steps: z
      .array(CreateStepSchema)
      .min(1)
      .openapi({
        example: [
          {
            ref: 'write',
            ordinal: 0,
            action_id: 'write_file_action',
            action_version: 1,
            on_failure: 'abort',
          },
        ],
      }),
    retry: RetryConfigSchema.optional(),
    timeout_ms: z.number().int().positive().optional().openapi({ example: 30000 }),
  })
  .openapi('CreateTaskDef');

export const TaskDefSchema = z
  .object({
    id: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    version: z.number().int(),
    name: z.string(),
    description: z.string(),
    project_id: z.string().nullable(),
    library_id: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    input_schema: z.record(z.string(), z.unknown()),
    output_schema: z.record(z.string(), z.unknown()),
    steps: z.array(StepSchema),
    retry: RetryConfigSchema.nullable(),
    timeout_ms: z.number().int().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('TaskDef');

export const TaskDefCreateResponseSchema = z
  .object({
    task_def_id: z.string(),
    task_def: TaskDefSchema,
  })
  .openapi('TaskDefCreateResponse');

export const TaskDefGetResponseSchema = z
  .object({
    task_def: TaskDefSchema,
  })
  .openapi('TaskDefGetResponse');

export const TaskDefListResponseSchema = z
  .object({
    task_defs: z.array(TaskDefSchema),
  })
  .openapi('TaskDefListResponse');
