import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

const ToolRetryConfigSchema = z.object({
  maxAttempts: z.number().int().positive(),
  backoffMs: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

export const CreateToolSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'search_files' }),
    description: z.string().min(1).openapi({ example: 'Search for files in the codebase' }),
    libraryId: z.string().optional().openapi({ example: 'lib_123' }),
    inputSchema: z.record(z.string(), z.unknown()).openapi({ example: { type: 'object' } }),
    targetType: z.enum(['task', 'workflow', 'agent']).openapi({ example: 'task' }),
    targetId: z.string().min(1).openapi({ example: 'task_abc' }),
    async: z.boolean().default(false).openapi({ example: false }),
    invocationMode: z.enum(['delegate', 'loop_in']).optional(),
    inputMapping: z.record(z.string(), z.string()).optional(),
    retry: ToolRetryConfigSchema.optional(),
  })
  .openapi('CreateTool');

export const ToolSchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string(),
    description: z.string(),
    libraryId: z.string().nullable(),
    inputSchema: z.record(z.string(), z.unknown()),
    targetType: z.enum(['task', 'workflow', 'agent']),
    targetId: z.string(),
    async: z.boolean(),
    invocationMode: z.enum(['delegate', 'loop_in']).nullable(),
    inputMapping: z.record(z.string(), z.string()).nullable(),
    retry: ToolRetryConfigSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Tool');

export const ToolCreateResponseSchema = z
  .object({
    toolId: z.string(),
    tool: ToolSchema,
  })
  .openapi('ToolCreateResponse');

export const ToolGetResponseSchema = z
  .object({
    tool: ToolSchema,
  })
  .openapi('ToolGetResponse');

export const ToolListResponseSchema = z
  .object({
    tools: z.array(ToolSchema),
  })
  .openapi('ToolListResponse');

export const ToolBatchRequestSchema = z
  .object({
    ids: z.array(z.string()).min(1).max(100),
  })
  .openapi('ToolBatchRequest');
