/**
 * LLM Response Interpretation
 *
 * Parses LLM response and generates dispatch decisions for tool calls
 * and message decisions for text content.
 */

import { CustomTypeRegistry, validateSchema, type JSONSchema } from '@wonder/schemas';

import type { AgentDecision, PlanningResult, ToolResult } from '../types';
import type { Tool } from './tools';

// Shared empty registry for basic JSON Schema validation (no custom types)
const emptyCustomTypes = new CustomTypeRegistry();

// ============================================================================
// LLM Response Types (provider-agnostic)
// ============================================================================

export type LLMToolUse = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type LLMResponse = {
  text?: string;
  toolUse?: LLMToolUse[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  /** Raw content blocks from LLM response (for tool continuation) */
  rawContent?: unknown[];
};

// ============================================================================
// Input Types
// ============================================================================

export type InterpretResponseParams = {
  turnId: string;
  response: LLMResponse;
  toolLookup: Map<string, Tool>;
};

// ============================================================================
// Response Interpretation
// ============================================================================

/**
 * Interpret LLM response and generate dispatch decisions.
 */
export function interpretResponse(params: InterpretResponseParams): PlanningResult {
  const { turnId, response, toolLookup } = params;
  // Use rawContent from response for tool continuation
  const rawContent = response.rawContent;

  const decisions: AgentDecision[] = [];
  const events: PlanningResult['events'] = [];

  // Handle text content
  if (response.text) {
    decisions.push({
      type: 'APPEND_MESSAGE',
      turnId,
      role: 'agent',
      content: response.text,
    });
  }

  // Handle tool calls
  if (response.toolUse) {
    for (const toolCall of response.toolUse) {
      const tool = toolLookup.get(toolCall.name);

      if (!tool) {
        // Unknown tool - generate error result
        events.push({
          type: 'planning.response.unknown_tool',
          payload: { turnId, toolName: toolCall.name, toolCallId: toolCall.id },
        });

        // Create an immediate error result decision
        const errorResult: ToolResult = {
          toolCallId: toolCall.id,
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Unknown tool: ${toolCall.name}`,
            retriable: false,
          },
        };

        decisions.push({
          type: 'ASYNC_OP_COMPLETED',
          turnId,
          operationId: toolCall.id,
          result: errorResult,
        });

        continue;
      }

      // Validate input against tool's JSON Schema
      const validation = validateToolInput(toolCall.input, tool);
      if (!validation.valid) {
        events.push({
          type: 'planning.response.invalid_input',
          payload: {
            turnId,
            toolCallId: toolCall.id,
            toolName: tool.name,
            errors: validation.errors,
          },
        });

        // Create immediate error result for invalid input
        const errorResult: ToolResult = {
          toolCallId: toolCall.id,
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `Invalid input: ${validation.errors.join('; ')}`,
            retriable: false,
          },
        };

        decisions.push({
          type: 'ASYNC_OP_COMPLETED',
          turnId,
          operationId: toolCall.id,
          result: errorResult,
        });

        continue;
      }

      // Generate dispatch decision based on target type
      const dispatchDecision = createDispatchDecision(turnId, toolCall, tool, rawContent);
      decisions.push(dispatchDecision);

      // Track async operations
      if (tool.async) {
        decisions.push({
          type: 'TRACK_ASYNC_OP',
          turnId,
          operationId: toolCall.id,
          targetType: tool.targetType,
        });
      }

      events.push({
        type: 'planning.response.tool_dispatch',
        payload: {
          turnId,
          toolCallId: toolCall.id,
          toolName: tool.name,
          targetType: tool.targetType,
          targetId: tool.targetId,
          async: tool.async ?? false,
        },
      });
    }
  }

  events.push({
    type: 'planning.response.interpreted',
    payload: {
      turnId,
      hasText: !!response.text,
      toolCallCount: response.toolUse?.length ?? 0,
      stopReason: response.stopReason,
    },
  });

  return { decisions, events };
}

// ============================================================================
// Input Validation
// ============================================================================

type InputValidationResult = {
  valid: true;
} | {
  valid: false;
  errors: string[];
};

/**
 * Validate tool input against the tool's JSON Schema.
 *
 * Returns validation errors if input doesn't match schema.
 */
function validateToolInput(input: Record<string, unknown>, tool: Tool): InputValidationResult {
  const schema = tool.inputSchema as JSONSchema;

  // Skip validation if no schema type defined (permissive)
  if (!schema.type) {
    return { valid: true };
  }

  const result = validateSchema(input, schema, emptyCustomTypes, {
    collectAllErrors: true,
    strictNullChecks: true,
  });

  if (result.valid) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: result.errors.map((e) => `${e.path || '/'}: ${e.message}`),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createDispatchDecision(
  turnId: string,
  toolCall: LLMToolUse,
  tool: Tool,
  rawContent?: unknown[],
): AgentDecision {
  const input = applyInputMapping(toolCall.input, tool.inputMapping);

  // Extract retry config if defined on tool
  const retry = tool.retry
    ? { maxAttempts: tool.retry.maxAttempts, backoffMs: tool.retry.backoffMs }
    : undefined;

  switch (tool.targetType) {
    case 'task':
      return {
        type: 'DISPATCH_TASK',
        turnId,
        toolCallId: toolCall.id,
        taskId: tool.targetId,
        input,
        rawContent,
        retry,
      };

    case 'workflow':
      return {
        type: 'DISPATCH_WORKFLOW',
        turnId,
        toolCallId: toolCall.id,
        workflowId: tool.targetId,
        input,
        async: tool.async ?? false,
        rawContent,
        retry,
      };

    case 'agent':
      return {
        type: 'DISPATCH_AGENT',
        turnId,
        toolCallId: toolCall.id,
        agentId: tool.targetId,
        input,
        mode: tool.invocationMode ?? 'delegate',
        async: tool.async ?? false,
        rawContent,
        retry,
      };
  }
}

function applyInputMapping(
  input: Record<string, unknown>,
  mapping?: Record<string, string>
): Record<string, unknown> {
  if (!mapping) {
    return input;
  }

  const result: Record<string, unknown> = {};

  for (const [targetKey, sourceKey] of Object.entries(mapping)) {
    if (sourceKey in input) {
      result[targetKey] = input[sourceKey];
    }
  }

  return result;
}
