/**
 * Tool Resolution
 *
 * Transforms Tool definitions into LLM-ready format and builds lookup structures.
 */

import type { TraceEventInput } from '@wonder/events';

import type { LLMToolSpec } from '../llm/types';

// Re-export for consumers
export type { LLMToolSpec } from '../llm/types';

// ============================================================================
// Tool Definition (from Resources/D1)
// ============================================================================

export type Tool = {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;

  targetType: 'task' | 'workflow' | 'agent';
  targetId: string;

  async?: boolean;
  invocationMode?: 'delegate' | 'loop_in';
  inputMapping?: Record<string, string>;

  retry?: {
    maxAttempts: number;
    backoffMs: number;
    timeoutMs: number;
  };
};

// ============================================================================
// Resolved Tools (for dispatch)
// ============================================================================

export type ResolvedTools = {
  specs: LLMToolSpec[];
  lookup: Map<string, Tool>;
  events: TraceEventInput[];
};

// ============================================================================
// Resolution
// ============================================================================

/**
 * Transform Tool definitions into LLM-ready specs and build lookup map.
 */
export function resolveTools(tools: Tool[]): ResolvedTools {
  const events: TraceEventInput[] = [];
  const specs: LLMToolSpec[] = [];
  const lookup = new Map<string, Tool>();

  for (const tool of tools) {
    specs.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    });

    lookup.set(tool.name, tool);
  }

  events.push({
    type: 'planning.tools.resolved',
    payload: {
      count: tools.length,
      names: tools.map((t) => t.name),
    },
  });

  return { specs, lookup, events };
}
