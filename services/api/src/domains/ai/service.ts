/** Service layer for AI domain operations */

import type { ServiceContext } from '~/infrastructure/context';
import * as aiRepo from './repository';

/**
 * Create a new prompt specification
 */
export async function createPromptSpec(
  ctx: ServiceContext,
  data: {
    version: number;
    name: string;
    description?: string;
    system_prompt?: string;
    template: string;
    template_language?: 'handlebars' | 'jinja2';
    requires?: unknown;
    produces?: unknown;
    examples?: unknown;
    tags?: string[];
  },
) {
  const promptSpec = await aiRepo.createPromptSpec(ctx.db, {
    version: data.version,
    name: data.name,
    description: data.description ?? '',
    system_prompt: data.system_prompt ?? null,
    template: data.template,
    template_language: data.template_language ?? 'handlebars',
    requires: data.requires ?? {},
    produces: data.produces ?? {},
    examples: data.examples ?? null,
    tags: data.tags ?? null,
  });

  return promptSpec;
}

/**
 * Get a prompt specification by ID
 */
export async function getPromptSpec(ctx: ServiceContext, promptSpecId: string) {
  const promptSpec = await aiRepo.getPromptSpec(ctx.db, promptSpecId);
  if (!promptSpec) {
    throw new Error(`PromptSpec not found: ${promptSpecId}`);
  }
  return promptSpec;
}

/**
 * Delete a prompt specification
 */
export async function deletePromptSpec(ctx: ServiceContext, promptSpecId: string) {
  const promptSpec = await aiRepo.getPromptSpec(ctx.db, promptSpecId);
  if (!promptSpec) {
    throw new Error(`PromptSpec not found: ${promptSpecId}`);
  }
  await aiRepo.deletePromptSpec(ctx.db, promptSpecId);
}

/**
 * Create a new model profile
 */
export async function createModelProfile(
  ctx: ServiceContext,
  data: {
    name: string;
    provider: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';
    model_id: string;
    parameters?: unknown;
    execution_config?: unknown;
    cost_per_1k_input_tokens?: number;
    cost_per_1k_output_tokens?: number;
  },
) {
  const profile = await aiRepo.createModelProfile(ctx.db, {
    name: data.name,
    provider: data.provider,
    model_id: data.model_id,
    parameters: data.parameters ?? null,
    execution_config: data.execution_config ?? null,
    cost_per_1k_input_tokens: data.cost_per_1k_input_tokens ?? 0,
    cost_per_1k_output_tokens: data.cost_per_1k_output_tokens ?? 0,
  });

  return profile;
}

/**
 * Get a model profile by ID
 */
export async function getModelProfile(ctx: ServiceContext, modelProfileId: string) {
  const profile = await aiRepo.getModelProfile(ctx.db, modelProfileId);
  if (!profile) {
    throw new Error(`ModelProfile not found: ${modelProfileId}`);
  }
  return profile;
}

/**
 * List model profiles, optionally filtered by provider
 */
export async function listModelProfiles(
  ctx: ServiceContext,
  filters?: { provider?: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local' },
) {
  if (filters?.provider) {
    return await aiRepo.listModelProfilesByProvider(ctx.db, filters.provider);
  }
  return await aiRepo.listModelProfiles(ctx.db);
}

/**
 * Delete a model profile
 */
export async function deleteModelProfile(ctx: ServiceContext, modelProfileId: string) {
  const profile = await aiRepo.getModelProfile(ctx.db, modelProfileId);
  if (!profile) {
    throw new Error(`ModelProfile not found: ${modelProfileId}`);
  }
  await aiRepo.deleteModelProfile(ctx.db, modelProfileId);
}
