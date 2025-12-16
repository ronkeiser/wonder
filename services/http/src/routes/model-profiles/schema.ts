/**
 * Model Profile Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateModelProfileSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'GPT-4 Default' }),
    provider: z
      .enum(['anthropic', 'openai', 'google', 'cloudflare', 'local'])
      .openapi({ example: 'openai' }),
    model_id: z
      .enum([
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/openai/gpt-oss-120b',
        '@cf/openai/gpt-oss-20b',
        'anthropic-dummy',
        'openai-dummy',
        'google-dummy',
        'local-dummy',
      ])
      .openapi({ example: '@cf/meta/llama-4-scout-17b-16e-instruct' }),
    parameters: z.record(z.string(), z.unknown()).openapi({ example: { temperature: 0.7 } }),
    execution_config: z.record(z.string(), z.unknown()).optional(),
    cost_per_1k_input_tokens: z.number().nonnegative().openapi({ example: 0.03 }),
    cost_per_1k_output_tokens: z.number().nonnegative().openapi({ example: 0.06 }),
  })
  .openapi('CreateModelProfile');

export const ModelProfileSchema = z
  .object({
    id: ulid(),
    name: z.string(),
    provider: z.enum(['anthropic', 'openai', 'google', 'cloudflare', 'local']),
    model_id: z.enum([
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/openai/gpt-oss-120b',
      '@cf/openai/gpt-oss-20b',
      'anthropic-dummy',
      'openai-dummy',
      'google-dummy',
      'local-dummy',
    ]),
    parameters: z.any().nullable(),
    execution_config: z.any().nullable(),
    cost_per_1k_input_tokens: z.number(),
    cost_per_1k_output_tokens: z.number(),
  })
  .openapi('ModelProfile');

export const ModelProfileCreateResponseSchema = z
  .object({
    model_profile_id: ulid(),
    model_profile: ModelProfileSchema,
  })
  .openapi('ModelProfileCreateResponse');

export const ModelProfileGetResponseSchema = z
  .object({
    model_profile: ModelProfileSchema,
  })
  .openapi('ModelProfileGetResponse');
