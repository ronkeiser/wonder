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
  modelProfileId: string;
  promptSpecId?: string;
  promptTemplate?: string;
  systemPrompt?: string;
  jsonSchema?: object;
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
    const { modelProfile } = await modelProfilesResource.get(impl.modelProfileId);

    // Resolve prompt template - either from prompt spec or directly provided
    let promptTemplate: string;
    let systemPrompt: string | undefined = impl.systemPrompt;
    let jsonSchema: object | undefined = impl.jsonSchema;

    if (impl.promptSpecId) {
      // Load prompt spec from Resources
      using promptSpecsResource = env.RESOURCES.promptSpecs();
      const { promptSpec } = await promptSpecsResource.get(impl.promptSpecId);
      promptTemplate = promptSpec.template;
      // Use prompt spec's system prompt if not overridden
      if (!systemPrompt && promptSpec.systemPrompt) {
        systemPrompt = promptSpec.systemPrompt;
      }
      // Use prompt spec's produces schema as jsonSchema if not overridden
      if (!jsonSchema && promptSpec.produces) {
        jsonSchema = promptSpec.produces as object;
      }

      // Log prompt spec details for debugging
      logger.info({
        eventType: 'llm_prompt_spec_loaded',
        message: 'Prompt spec loaded',
        traceId: context.workflowRunId,
        metadata: {
          stepRef: context.stepRef,
          promptSpecId: impl.promptSpecId,
          hasProduces: !!promptSpec.produces,
          produces: promptSpec.produces,
          templateLength: promptTemplate.length,
        },
      });
    } else if (impl.promptTemplate) {
      promptTemplate = impl.promptTemplate;
    } else {
      throw new Error('LLM action requires either promptSpecId or promptTemplate');
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
      ...modelProfile.parameters,
    };

    // Add response_format if jsonSchema provided (from impl or prompt spec produces)
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
      eventType: 'llm_action_started',
      message: 'LLM action started',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        model: modelProfile.modelId,
        provider: modelProfile.provider,
        promptLength: prompt.length,
        hasJsonSchema: !!jsonSchema,
      },
    });

    // Call Workers AI
    const response = (await env.AI.run(
      modelProfile.modelId as Parameters<Ai['run']>[0],
      aiOptions,
    )) as {
      response?: unknown;
    };

    const duration = Date.now() - startTime;
    const rawResponse = response?.response ?? 'No response from LLM';

    // Log raw LLM response for debugging
    logger.info({
      eventType: 'llm_raw_response',
      message: 'LLM raw response received',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        rawResponse: rawResponse,
        rawResponseType: typeof rawResponse,
      },
    });

    // Process response based on jsonSchema presence
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
            eventType: 'llm_json_parse_fallback',
            message: 'Could not parse JSON response, using raw string',
            traceId: context.workflowRunId,
            metadata: { stepRef: context.stepRef, rawResponse: rawResponse },
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
      eventType: 'llm_action_completed',
      message: 'LLM action completed',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        durationMs: duration,
        responseType: typeof processedResponse,
      },
    });

    return {
      success: true,
      output: {
        response: processedResponse,
      },
      metrics: {
        durationMs: duration,
        // TODO: Extract token counts from response if available
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      eventType: 'llm_action_failed',
      message: 'LLM action failed',
      traceId: context.workflowRunId,
      metadata: {
        stepRef: context.stepRef,
        actionId: action.id,
        durationMs: duration,
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
        durationMs: duration,
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
