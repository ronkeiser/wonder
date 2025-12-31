/**
 * LLM Module
 *
 * Direct LLM calls with streaming support.
 * ConversationDO makes LLM calls directly (not via task dispatch)
 * to enable real-time streaming to the client.
 */

import type { LLMResponse } from '../planning/response';
import type { LLMToolSpec } from '../planning/tools';
import type { LLMRequest } from '../types';

// ============================================================================
// LLM Call
// ============================================================================

/**
 * Call the LLM with the assembled context and tools.
 *
 * This is called directly by ConversationDO after context assembly completes.
 * The LLM request is in provider-native format (from context assembly workflow).
 *
 * @param request - Provider-native LLM request (from context assembly)
 * @param tools - Tool specs for the LLM to use
 * @returns LLM response with text and/or tool calls
 */
export async function callLLM(
  request: LLMRequest,
  tools: LLMToolSpec[],
): Promise<LLMResponse> {
  // TODO: Implement actual LLM call
  //
  // This should:
  // 1. Determine the provider from the model profile
  // 2. Make the API call with the provider-native request
  // 3. Stream tokens to the client via WebSocket (handled by streaming layer)
  // 4. Return the complete response for decision-making
  //
  // For now, throw to make it clear this needs implementation.
  // Tests can mock this function.

  throw new Error(
    'LLM integration not yet implemented. ' +
    `Request had ${request.messages.length} messages and ${tools.length} tools.`
  );
}

// ============================================================================
// Streaming Support (placeholder)
// ============================================================================

/**
 * Stream callback for real-time token delivery.
 *
 * Called for each token as it arrives from the LLM.
 * The streaming layer will forward these to the WebSocket client.
 */
export type StreamCallback = (token: string) => void;

/**
 * Call the LLM with streaming.
 *
 * @param request - Provider-native LLM request
 * @param tools - Tool specs for the LLM
 * @param onToken - Callback for each streamed token
 * @returns Complete LLM response after streaming finishes
 */
export async function callLLMWithStreaming(
  request: LLMRequest,
  tools: LLMToolSpec[],
  onToken: StreamCallback,
): Promise<LLMResponse> {
  // TODO: Implement streaming LLM call
  //
  // This is the primary path for user-facing conversations.
  // Non-streaming callLLM() is for internal use (e.g., testing).

  throw new Error(
    'Streaming LLM integration not yet implemented. ' +
    `Request had ${request.messages.length} messages and ${tools.length} tools.`
  );
}
