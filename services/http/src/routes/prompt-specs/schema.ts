/**
 * Prompt Spec Zod Schemas
 */

import { z } from '@hono/zod-openapi';

export const CreatePromptSpecSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Summarization Prompt' }),
    description: z.string().min(1).openapi({ example: 'Prompt for summarizing text' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    system_prompt: z.string().optional().openapi({ example: 'You are a helpful assistant.' }),
    template: z.string().min(1).openapi({ example: 'Summarize: {{text}}' }),
    template_language: z.enum(['handlebars', 'jinja2']).openapi({ example: 'handlebars' }),
    requires: z.record(z.string(), z.unknown()).openapi({ example: { text: 'string' } }),
    produces: z.record(z.string(), z.unknown()).openapi({ example: { summary: 'string' } }),
    examples: z.array(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    autoversion: z
      .boolean()
      .optional()
      .openapi({
        description:
          'When true, compute content hash for deduplication. If existing spec with same name and content exists, return it. Otherwise auto-increment version.',
      }),
  })
  .openapi('CreatePromptSpec');

export const PromptSpecSchema = z
  .object({
    id: z.string().openapi({ example: 'summarize-text' }),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    system_prompt: z.string().nullable(),
    template: z.string(),
    template_language: z.enum(['handlebars', 'jinja2']),
    requires: z.record(z.string(), z.unknown()),
    produces: z.record(z.string(), z.unknown()),
    examples: z.array(z.unknown()).nullable(),
    tags: z.array(z.string()).nullable(),
    content_hash: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('PromptSpec');

export const PromptSpecCreateResponseSchema = z
  .object({
    prompt_spec_id: z.string(),
    prompt_spec: PromptSpecSchema,
    reused: z
      .boolean()
      .openapi({ description: 'True if an existing prompt spec was reused (autoversion matched)' }),
  })
  .openapi('PromptSpecCreateResponse');

export const PromptSpecGetResponseSchema = z
  .object({
    prompt_spec: PromptSpecSchema,
  })
  .openapi('PromptSpecGetResponse');
