/**
 * Anthropic Claude Provider
 *
 * Direct API integration using fetch for minimal overhead.
 * Docs: https://docs.anthropic.com/claude/reference/messages
 */

import type { Logger } from '@wonder/logs';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
}

export interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

export interface AnthropicError {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

export interface AnthropicCallResult {
  response: string;
  usage: AnthropicUsage;
  stopReason: AnthropicResponse['stop_reason'];
}

/**
 * Call the Anthropic Messages API
 */
export async function callAnthropic(
  apiKey: string,
  request: AnthropicRequest,
  logger: Logger,
  traceId: string,
): Promise<AnthropicCallResult> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as AnthropicError;
    const errorMessage = errorBody.error?.message ?? `HTTP ${response.status}`;
    const errorType = errorBody.error?.type ?? 'unknown';

    logger.error({
      eventType: 'anthropic_api_error',
      message: 'Anthropic API error',
      traceId,
      metadata: {
        status: response.status,
        errorType,
        errorMessage,
      },
    });

    const error = new Error(`Anthropic API error: ${errorMessage}`);
    (error as Error & { statusCode: number }).statusCode = response.status;
    (error as Error & { errorType: string }).errorType = errorType;
    throw error;
  }

  const result = (await response.json()) as AnthropicResponse;

  // Extract text from content blocks
  const textContent = result.content
    .filter((block): block is AnthropicContentBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    response: textContent,
    usage: result.usage,
    stopReason: result.stop_reason,
  };
}

/**
 * Determine if an Anthropic error is retryable
 */
export function isAnthropicRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const statusCode = (error as Error & { statusCode?: number }).statusCode;
  const errorType = (error as Error & { errorType?: string }).errorType;

  // Rate limiting (429)
  if (statusCode === 429) return true;

  // Server errors (5xx)
  if (statusCode && statusCode >= 500) return true;

  // Overloaded
  if (errorType === 'overloaded_error') return true;

  // API connection issues
  if (errorType === 'api_error') return true;

  return false;
}