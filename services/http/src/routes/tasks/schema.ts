/**
 * Task Zod Schemas
 */

import { z } from '@hono/zod-openapi';

/** Step schema (embedded in Task) */
export const StepSchema = z
  .object({
    id: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    ref: z.string().min(1).openapi({ example: 'call_llm' }),
    ordinal: z.number().int().min(0).openapi({ example: 0 }),
    actionId: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    actionVersion: z.number().int().positive().openapi({ example: 1 }),
    inputMapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .openapi({
        example: { prompt: '$.input.prompt' },
      }),
    outputMapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .openapi({
        example: { response: '$.result.text' },
      }),
    onFailure: z
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
    maxAttempts: z.number().int().positive().openapi({ example: 3 }),
    backoff: z.enum(['none', 'linear', 'exponential']).openapi({ example: 'exponential' }),
    initialDelayMs: z.number().int().positive().openapi({ example: 1000 }),
    maxDelayMs: z.number().int().positive().nullable().openapi({ example: 30000 }),
  })
  .openapi('RetryConfig');

/** Create step input (without id, which is auto-generated) */
export const CreateStepSchema = z
  .object({
    ref: z.string().min(1).openapi({ example: 'call_llm' }),
    ordinal: z.number().int().min(0).openapi({ example: 0 }),
    actionId: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    actionVersion: z.number().int().positive().openapi({ example: 1 }),
    inputMapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .default(null)
      .openapi({
        example: { prompt: '$.input.prompt' },
      }),
    outputMapping: z
      .record(z.string(), z.unknown())
      .nullable()
      .default(null)
      .openapi({
        example: { response: '$.result.text' },
      }),
    onFailure: z
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

export const CreateTaskSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Write File Verified' }),
    reference: z.string().optional().openapi({
      example: 'core/write-file-verified',
      description: 'Stable identity for autoversion scoping. Required when autoversion=true.',
    }),
    description: z
      .string()
      .optional()
      .openapi({ example: 'Write file with read-back verification' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    projectId: z.string().optional().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    libraryId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    inputSchema: z.record(z.string(), z.unknown()).openapi({
      example: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
      },
    }),
    outputSchema: z.record(z.string(), z.unknown()).openapi({
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
            actionId: 'write_file_action',
            actionVersion: 1,
            onFailure: 'abort',
          },
        ],
      }),
    retry: RetryConfigSchema.optional(),
    timeoutMs: z.number().int().positive().optional().openapi({ example: 30000 }),
    autoversion: z.boolean().optional().openapi({
      description:
        'When true, compute content hash for deduplication. If existing task with same name/owner and content exists, return it. Otherwise auto-increment version.',
    }),
    force: z.boolean().optional().openapi({
      description: 'Skip content hash deduplication and always create a new version.',
    }),
  })
  .openapi('CreateTask');

export const TaskSchema = z
  .object({
    id: z.string().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    version: z.number().int(),
    name: z.string(),
    reference: z.string().nullable().openapi({ description: 'Stable identity for autoversion scoping' }),
    description: z.string(),
    projectId: z.string().nullable(),
    libraryId: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: z.record(z.string(), z.unknown()),
    steps: z.array(StepSchema),
    retry: RetryConfigSchema.nullable(),
    timeoutMs: z.number().int().nullable(),
    contentHash: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Task');

export const TaskCreateResponseSchema = z
  .object({
    taskId: z.string(),
    task: TaskSchema,
    reused: z
      .boolean()
      .openapi({ description: 'True if an existing task was reused (autoversion matched)' }),
    version: z.number().openapi({ description: 'Version number of the created/reused task' }),
    latestVersion: z.number().optional().openapi({
      description: 'Latest version for this name (only present when reused=true)',
    }),
  })
  .openapi('TaskCreateResponse');

export const TaskGetResponseSchema = z
  .object({
    task: TaskSchema,
  })
  .openapi('TaskGetResponse');

export const TaskListResponseSchema = z
  .object({
    tasks: z.array(TaskSchema),
  })
  .openapi('TaskListResponse');
