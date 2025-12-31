/**
 * Context Assembly Planning
 *
 * Plans the dispatch of the context assembly workflow.
 */

import type {
  AgentDecision,
  ContextAssemblyInput,
  PlanningResult,
  ToolDefinition,
  TurnSnapshot,
} from '../types';

// ============================================================================
// Input Types
// ============================================================================

export type ContextAssemblyParams = {
  turnId: string;
  conversationId: string;
  userMessage: string;
  recentTurns: TurnSnapshot[];
  contextAssemblyWorkflowId: string;
  modelProfileId: string;
  toolIds: string[];
  toolDefinitions: ToolDefinition[];
};

// ============================================================================
// Planning
// ============================================================================

/**
 * Plan context assembly workflow dispatch.
 */
export function decideContextAssembly(params: ContextAssemblyParams): PlanningResult {
  const {
    turnId,
    conversationId,
    userMessage,
    recentTurns,
    contextAssemblyWorkflowId,
    modelProfileId,
    toolIds,
    toolDefinitions,
  } = params;

  const input: ContextAssemblyInput = {
    conversationId,
    userMessage,
    recentTurns,
    modelProfileId,
    toolIds,
    toolDefinitions,
  };

  const decision: AgentDecision = {
    type: 'DISPATCH_CONTEXT_ASSEMBLY',
    turnId,
    workflowId: contextAssemblyWorkflowId,
    input,
  };

  return {
    decisions: [decision],
    events: [
      {
        type: 'planning.context_assembly.planned',
        payload: {
          turnId,
          workflowId: contextAssemblyWorkflowId,
          recentTurnsCount: recentTurns.length,
          toolCount: toolIds.length,
        },
      },
    ],
  };
}
