/** AI action executors */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { runInference } from '~/infrastructure/clients/workers-ai';
import * as aiRepo from './repository';

/**
 * Execute an LLM call action.
 */
export async function executeLLMCall(
  env: { db: DrizzleD1Database; ai: Ai },
  action: { implementation: unknown; produces: unknown },
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
  console.log('Input data for template:', JSON.stringify(inputData));
  console.log('Template:', promptSpec.template);
  const userPrompt = renderTemplate(promptSpec.template, inputData);
  console.log('Rendered prompt:', userPrompt);

  // Build messages
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (promptSpec.system_prompt) {
    messages.push({ role: 'system', content: promptSpec.system_prompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  // Call Workers AI
  const result = await runInference(env.ai, modelProfile.model_id as keyof AiModels, messages);

  console.log('LLM result:', JSON.stringify(result));

  // Map response to the field name specified in produces schema
  // For Stage 0: assumes produces is a simple object with one string property
  const produces = action.produces as { [key: string]: string } | null;
  if (produces && typeof produces === 'object') {
    const outputKey = Object.keys(produces)[0];
    if (outputKey) {
      const output = { [outputKey]: result.response };
      console.log('Mapped output:', JSON.stringify(output));
      return output;
    }
  }

  // Fallback to 'response' if no produces schema
  const fallback = { response: result.response };
  console.log('Fallback output:', JSON.stringify(fallback));
  return fallback;
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
