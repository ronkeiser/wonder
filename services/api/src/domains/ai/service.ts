/** Service layer for AI domain operations */

import { ConflictError, NotFoundError, extractDbError } from '~/errors';
import type { ServiceContext } from '~/infrastructure/context';
import * as aiRepo from './repository';

/** Create a new prompt specification */
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
  ctx.logger.info('prompt_spec_create_started', { name: data.name, version: data.version });

  try {
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

    ctx.logger.info('prompt_spec_created', { prompt_spec_id: promptSpec.id });
    return promptSpec;
  } catch (error) {
    const dbError = extractDbError(error);

    if (dbError.constraint === 'unique') {
      ctx.logger.warn('prompt_spec_create_conflict', { name: data.name, field: dbError.field });
      throw new ConflictError(
        `PromptSpec with ${dbError.field} already exists`,
        dbError.field,
        'unique',
      );
    }

    ctx.logger.error('prompt_spec_create_failed', { name: data.name, error: dbError.message });
    throw error;
  }
}

/** Get a prompt specification by ID */
export async function getPromptSpec(ctx: ServiceContext, promptSpecId: string) {
  ctx.logger.info('prompt_spec_get', { prompt_spec_id: promptSpecId });

  const promptSpec = await aiRepo.getPromptSpec(ctx.db, promptSpecId);
  if (!promptSpec) {
    ctx.logger.warn('prompt_spec_not_found', { prompt_spec_id: promptSpecId });
    throw new NotFoundError(`PromptSpec not found: ${promptSpecId}`, 'prompt_spec', promptSpecId);
  }
  return promptSpec;
}

/** Delete a prompt specification */
export async function deletePromptSpec(ctx: ServiceContext, promptSpecId: string) {
  ctx.logger.info('prompt_spec_delete_started', { prompt_spec_id: promptSpecId });

  const promptSpec = await aiRepo.getPromptSpec(ctx.db, promptSpecId);
  if (!promptSpec) {
    ctx.logger.warn('prompt_spec_not_found', { prompt_spec_id: promptSpecId });
    throw new NotFoundError(`PromptSpec not found: ${promptSpecId}`, 'prompt_spec', promptSpecId);
  }

  await aiRepo.deletePromptSpec(ctx.db, promptSpecId);
  ctx.logger.info('prompt_spec_deleted', { prompt_spec_id: promptSpecId });
}

/** Create a new model profile */
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
  ctx.logger.info('model_profile_create_started', { name: data.name, provider: data.provider });

  try {
    const profile = await aiRepo.createModelProfile(ctx.db, {
      name: data.name,
      provider: data.provider,
      model_id: data.model_id,
      parameters: data.parameters ?? null,
      execution_config: data.execution_config ?? null,
      cost_per_1k_input_tokens: data.cost_per_1k_input_tokens ?? 0,
      cost_per_1k_output_tokens: data.cost_per_1k_output_tokens ?? 0,
    });

    ctx.logger.info('model_profile_created', { model_profile_id: profile.id });
    return profile;
  } catch (error) {
    const dbError = extractDbError(error);

    if (dbError.constraint === 'unique') {
      ctx.logger.warn('model_profile_create_conflict', { name: data.name, field: dbError.field });
      throw new ConflictError(
        `ModelProfile with ${dbError.field} already exists`,
        dbError.field,
        'unique',
      );
    }

    ctx.logger.error('model_profile_create_failed', { name: data.name, error: dbError.message });
    throw error;
  }
}

/** Get a model profile by ID */
export async function getModelProfile(ctx: ServiceContext, modelProfileId: string) {
  ctx.logger.info('model_profile_get', { model_profile_id: modelProfileId });

  const profile = await aiRepo.getModelProfile(ctx.db, modelProfileId);
  if (!profile) {
    ctx.logger.warn('model_profile_not_found', { model_profile_id: modelProfileId });
    throw new NotFoundError(
      `ModelProfile not found: ${modelProfileId}`,
      'model_profile',
      modelProfileId,
    );
  }
  return profile;
}

/** List model profiles, optionally filtered by provider */
export async function listModelProfiles(
  ctx: ServiceContext,
  filters?: { provider?: 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local' },
) {
  if (filters?.provider) {
    return await aiRepo.listModelProfilesByProvider(ctx.db, filters.provider);
  }
  return await aiRepo.listModelProfiles(ctx.db);
}

/** Delete a model profile */
export async function deleteModelProfile(ctx: ServiceContext, modelProfileId: string) {
  ctx.logger.info('model_profile_delete_started', { model_profile_id: modelProfileId });

  const profile = await aiRepo.getModelProfile(ctx.db, modelProfileId);
  if (!profile) {
    ctx.logger.warn('model_profile_not_found', { model_profile_id: modelProfileId });
    throw new NotFoundError(
      `ModelProfile not found: ${modelProfileId}`,
      'model_profile',
      modelProfileId,
    );
  }

  await aiRepo.deleteModelProfile(ctx.db, modelProfileId);
  ctx.logger.info('model_profile_deleted', { model_profile_id: modelProfileId });
}
