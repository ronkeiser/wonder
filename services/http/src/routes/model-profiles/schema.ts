/**
 * Model Profile Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateModelProfileSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'GPT-4 Default' }),
    reference: z.string().optional().openapi({
      example: 'core/gpt4-default',
      description: 'Stable identity for autoversion scoping. Required when autoversion=true.',
    }),
    provider: z
      .enum(['anthropic', 'openai', 'google', 'cloudflare', 'local'])
      .openapi({ example: 'openai' }),
    modelId: z
      .enum([
        // Cloudflare Workers AI models
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/openai/gpt-oss-120b',
        '@cf/openai/gpt-oss-20b',
        // Anthropic Claude models
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-haiku-20240307',
        // Dummy providers for testing
        'anthropic-dummy',
        'openai-dummy',
        'google-dummy',
        'local-dummy',
      ])
      .openapi({ example: 'claude-3-5-sonnet-20241022' }),
    parameters: z.record(z.string(), z.unknown()).openapi({ example: { temperature: 0.7 } }),
    executionConfig: z.record(z.string(), z.unknown()).optional(),
    costPer1kInputTokens: z.number().nonnegative().openapi({ example: 0.03 }),
    costPer1kOutputTokens: z.number().nonnegative().openapi({ example: 0.06 }),
    autoversion: z.boolean().optional().openapi({ description: 'Enable content-based deduplication' }),
    force: z.boolean().optional().openapi({
      description: 'Skip content hash deduplication and always create a new version.',
    }),
  })
  .openapi('CreateModelProfile');

export const ModelProfileSchema = z
  .object({
    id: ulid(),
    name: z.string(),
    version: z.number(),
    reference: z.string().openapi({ description: 'Stable identity for autoversion scoping' }),
    provider: z.string().openapi({ example: 'anthropic' }),
    modelId: z.string().openapi({ example: 'claude-3-5-sonnet-20241022' }),
    parameters: z.any(),
    executionConfig: z.any().nullable(),
    costPer1kInputTokens: z.number(),
    costPer1kOutputTokens: z.number(),
    contentHash: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ModelProfile');

export const ModelProfileCreateResponseSchema = z
  .object({
    modelProfileId: ulid(),
    modelProfile: ModelProfileSchema,
    reused: z.boolean().optional().openapi({ description: 'True if an existing model profile was reused' }),
    version: z.number().openapi({ description: 'Version number of the created/reused model profile' }),
    latestVersion: z.number().optional().openapi({
      description: 'Latest version for this name (only present when reused=true)',
    }),
  })
  .openapi('ModelProfileCreateResponse');

export const ModelProfileGetResponseSchema = z
  .object({
    modelProfile: ModelProfileSchema,
  })
  .openapi('ModelProfileGetResponse');
