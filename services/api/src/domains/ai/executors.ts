/** AI action executors */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { runInference } from '~/infrastructure/clients/workers-ai';
import * as aiRepo from './repository';

/**
 * Execute an LLM call action.
 */
export async function executeLLMCall(
  env: { db: DrizzleD1Database; ai: Ai },
  action: { implementation: unknown },
  inputData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const impl = action.implementation as {
    prompt_spec_id: string;
    model_profile_id: string;
  };

  // Load prompt spec and model profile
  const promptSpec = await aiRepo.getPromptSpec(env.db, impl.prompt_spec_id);
  if (!promptSpec) {
    throw new Error(`PromptSpec not found: ${impl.prompt_spec_id}`);
  }

  const modelProfile = await aiRepo.getModelProfile(env.db, impl.model_profile_id);
  if (!modelProfile) {
    throw new Error(`ModelProfile not found: ${impl.model_profile_id}`);
  }

  // Render prompt template
  const userPrompt = renderTemplate(promptSpec.template, inputData);

  // Build messages
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (promptSpec.system_prompt) {
    messages.push({ role: 'system', content: promptSpec.system_prompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  console.log('[AI] Calling LLM', {
    model_id: modelProfile.model_id,
    prompt_spec_id: promptSpec.id,
    input_data: inputData,
    template: promptSpec.template,
    rendered_prompt: userPrompt,
  });

  // Call Workers AI
  const result = await runInference(env.ai, modelProfile.model_id as keyof AiModels, messages);

  console.log('[AI] LLM call completed', {
    model_id: modelProfile.model_id,
    response_length: result.response.length,
    response: result.response,
  });

  return { response: result.response };
}

/**
 * Render a template string with data.
 * For Stage 0: simple {{key}} replacement.
 */
function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value));
  }
  return result;
}
