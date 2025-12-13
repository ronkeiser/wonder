/**
 * LLM Action Handler
 *
 * Executes LLM calls using Cloudflare Workers AI.
 *
 * Implementation schema for llm_call actions:
 * {
 *   model_profile_id: string;  // Reference to model profile
 *   prompt_template: string;   // Template with {{variable}} placeholders
 *   system_prompt?: string;    // Optional system prompt
 *   json_schema?: object;      // Optional structured output schema
 * }
 *
 * @see docs/architecture/executor.md
 */

import type { ActionDeps, ActionInput, ActionOutput } from './types';

/**
 * LLM implementation schema
 */
interface LLMImplementation {
  model_profile_id: string;
  prompt_template: string;
  system_prompt?: string;
  json_schema?: object;
}

/**
 * Execute an LLM call action
 */
export async function executeLLMAction(
  input: ActionInput,
  deps: ActionDeps,
): Promise<ActionOutput> {
  const { action, input: actionInput, context } = input;
  const { logger, env } = deps;
  const startTime = Date.now();

  const impl = action.implementation as LLMImplementation;

  try {
    // Load model profile from Resources
    using modelProfilesResource = env.RESOURCES.modelProfiles();
    const { model_profile } = await modelProfilesResource.get(impl.model_profile_id);

    // Render prompt template with input values
    const prompt = renderTemplate(impl.prompt_template, actionInput);

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];

    if (impl.system_prompt) {
      messages.push({
        role: 'system',
        content: renderTemplate(impl.system_prompt, actionInput),
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });

    // Build AI.run options
    const aiOptions: Record<string, unknown> = {
      messages,
      ...model_profile.parameters,
    };

    // Add response_format if json_schema provided
    if (impl.json_schema) {
      aiOptions.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response_schema',
          strict: true,
          schema: impl.json_schema,
        },
      };
    }

    logger.info({
      event_type: 'llm_action_started',
      message: 'LLM action started',
      trace_id: context.workflowRunId,
      metadata: {
        step_ref: context.stepRef,
        action_id: action.id,
        model: model_profile.model_id,
        provider: model_profile.provider,
        prompt_length: prompt.length,
        has_json_schema: !!impl.json_schema,
      },
    });

    // Call Workers AI
    const response = (await env.AI.run(
      model_profile.model_id as Parameters<Ai['run']>[0],
      aiOptions,
    )) as {
      response?: unknown;
    };

    const duration = Date.now() - startTime;
    const rawResponse = response?.response ?? 'No response from LLM';

    // Process response based on json_schema presence
    let processedResponse: unknown;

    if (impl.json_schema) {
      if (typeof rawResponse === 'object') {
        // Workers AI already parsed JSON
        processedResponse = rawResponse;
      } else if (typeof rawResponse === 'string') {
        // Try to parse string response
        try {
          processedResponse = JSON.parse(rawResponse);
        } catch {
          logger.warn({
            event_type: 'llm_json_parse_fallback',
            message: 'Could not parse JSON response, using raw string',
            trace_id: context.workflowRunId,
            metadata: { step_ref: context.stepRef, raw_response: rawResponse },
          });
          processedResponse = rawResponse;
        }
      } else {
        processedResponse = rawResponse;
      }
    } else {
      processedResponse = rawResponse;
    }

    logger.info({
      event_type: 'llm_action_completed',
      message: 'LLM action completed',
      trace_id: context.workflowRunId,
      metadata: {
        step_ref: context.stepRef,
        action_id: action.id,
        duration_ms: duration,
        response_type: typeof processedResponse,
      },
    });

    return {
      success: true,
      output: {
        response: processedResponse,
      },
      metrics: {
        duration_ms: duration,
        // TODO: Extract token counts from response if available
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      event_type: 'llm_action_failed',
      message: 'LLM action failed',
      trace_id: context.workflowRunId,
      metadata: {
        step_ref: context.stepRef,
        action_id: action.id,
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return {
      success: false,
      output: {},
      error: {
        message: error instanceof Error ? error.message : String(error),
        retryable: isRetryableError(error),
      },
      metrics: {
        duration_ms: duration,
      },
    };
  }
}

/**
 * Render a template string with variable substitution
 * Supports {{variable}} and {{nested.path}} syntax
 */
function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const value = getNestedValue(values, path.trim());
    if (value === undefined || value === null) {
      return '';
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

/**
 * Get nested value from object by dot-path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Rate limiting
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return true;
  }

  // Temporary service issues
  if (message.includes('timeout') || message.includes('temporarily unavailable')) {
    return true;
  }

  // Network errors
  if (message.includes('network') || message.includes('connection')) {
    return true;
  }

  return false;
}
