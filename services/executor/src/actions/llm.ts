/**
 * LLM Action Handler
 *
 * Executes LLM calls using Cloudflare Workers AI.
 *
 * Implementation schema for llm_call actions:
 * {
 *   model_profile_id: string;  // Reference to model profile
 *   prompt_spec_id?: string;   // Reference to prompt spec (preferred)
 *   prompt_template?: string;  // Direct template with {{variable}} placeholders
 *   system_prompt?: string;    // Optional system prompt (overrides prompt spec)
 *   json_schema?: object;      // Optional structured output schema
 * }
 *
 * Either prompt_spec_id or prompt_template must be provided.
 *
 * @see docs/architecture/executor.md
 */

import { render } from '@wonder/templates';
import type { ActionDeps, ActionInput, ActionOutput } from './types';

/**
 * LLM implementation schema
 */
interface LLMImplementation {
  model_profile_id: string;
  prompt_spec_id?: string;
  prompt_template?: string;
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

    // Resolve prompt template - either from prompt spec or directly provided
    let promptTemplate: string;
    let systemPrompt: string | undefined = impl.system_prompt;
    let jsonSchema: object | undefined = impl.json_schema;

    if (impl.prompt_spec_id) {
      // Load prompt spec from Resources
      using promptSpecsResource = env.RESOURCES.promptSpecs();
      const { prompt_spec } = await promptSpecsResource.get(impl.prompt_spec_id);
      promptTemplate = prompt_spec.template;
      // Use prompt spec's system prompt if not overridden
      if (!systemPrompt && prompt_spec.system_prompt) {
        systemPrompt = prompt_spec.system_prompt;
      }
      // Use prompt spec's produces schema as json_schema if not overridden
      if (!jsonSchema && prompt_spec.produces) {
        jsonSchema = prompt_spec.produces as object;
      }

      // Log prompt spec details for debugging
      logger.info({
        event_type: 'llm_prompt_spec_loaded',
        message: 'Prompt spec loaded',
        trace_id: context.workflowRunId,
        metadata: {
          step_ref: context.stepRef,
          prompt_spec_id: impl.prompt_spec_id,
          has_produces: !!prompt_spec.produces,
          produces: prompt_spec.produces,
          template_length: promptTemplate.length,
        },
      });
    } else if (impl.prompt_template) {
      promptTemplate = impl.prompt_template;
    } else {
      throw new Error('LLM action requires either prompt_spec_id or prompt_template');
    }

    // Render prompt template with input values
    const prompt = render(promptTemplate, actionInput);

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: render(systemPrompt, actionInput),
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

    // Add response_format if json_schema provided (from impl or prompt spec produces)
    if (jsonSchema) {
      aiOptions.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response_schema',
          strict: true,
          schema: jsonSchema,
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
        has_json_schema: !!jsonSchema,
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

    // Log raw LLM response for debugging
    logger.info({
      event_type: 'llm_raw_response',
      message: 'LLM raw response received',
      trace_id: context.workflowRunId,
      metadata: {
        step_ref: context.stepRef,
        raw_response: rawResponse,
        raw_response_type: typeof rawResponse,
      },
    });

    // Process response based on json_schema presence
    let processedResponse: unknown;

    if (jsonSchema) {
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
