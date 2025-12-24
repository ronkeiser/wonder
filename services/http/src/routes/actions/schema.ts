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
      .enum(['llm', 'mcp', 'http', 'human', 'context', 'artifact', 'vector', 'metric', 'mock'])
      .openapi({ example: 'llm' }),
    implementation: z.record(z.string(), z.unknown()).openapi({ example: { model: 'gpt-4' } }),
    requires: z.record(z.string(), z.unknown()).optional(),
    produces: z.record(z.string(), z.unknown()).optional(),
    execution: z.record(z.string(), z.unknown()).optional(),
    idempotency: z.record(z.string(), z.unknown()).optional(),
    autoversion: z
      .boolean()
      .optional()
      .openapi({
        description:
          'When true, compute content hash for deduplication. If existing action with same name and content exists, return it. Otherwise auto-increment version.',
      }),
  })
  .openapi('CreateAction');

export const ActionSchema = z
  .object({
    id: z.string().openapi({ example: 'send-email' }),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    kind: z.enum(['llm', 'mcp', 'http', 'human', 'context', 'artifact', 'vector', 'metric', 'mock']),
    implementation: z.record(z.string(), z.unknown()),
    requires: z.record(z.string(), z.unknown()).nullable(),
    produces: z.record(z.string(), z.unknown()).nullable(),
    execution: z.record(z.string(), z.unknown()).nullable(),
    idempotency: z.record(z.string(), z.unknown()).nullable(),
    contentHash: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Action');

export const ActionCreateResponseSchema = z
  .object({
    actionId: z.string(),
    action: ActionSchema,
    reused: z
      .boolean()
      .openapi({ description: 'True if an existing action was reused (autoversion matched)' }),
  })
  .openapi('ActionCreateResponse');

export const ActionGetResponseSchema = z
  .object({
    action: ActionSchema,
  })
  .openapi('ActionGetResponse');
