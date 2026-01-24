/**
 * Memory Extraction Planning
 *
 * Plans the dispatch of the memory extraction workflow.
 */

import type { AgentDecision, MemoryExtractionInput, Move, PlanningResult } from '../types';

// ============================================================================
// Input Types
// ============================================================================

export type MemoryExtractionParams = {
  turnId: string;
  agentId: string;
  transcript: Move[];
  memoryExtractionWorkflowDefId: string;
  projectId: string;
};

// ============================================================================
// Planning
// ============================================================================

/**
 * Plan memory extraction workflow dispatch.
 *
 * Returns empty decisions if transcript is empty (nothing to extract).
 */
export function decideMemoryExtraction(params: MemoryExtractionParams): PlanningResult {
  const { turnId, agentId, transcript, memoryExtractionWorkflowDefId, projectId } = params;

  if (transcript.length === 0) {
    return {
      decisions: [],
      events: [
        {
          type: 'planning.memory_extraction.skipped',
          payload: { turnId, reason: 'empty_transcript' },
        },
      ],
    };
  }

  const input: MemoryExtractionInput = {
    agentId,
    turnId,
    transcript,
  };

  const decision: AgentDecision = {
    type: 'DISPATCH_MEMORY_EXTRACTION',
    turnId,
    workflowDefId: memoryExtractionWorkflowDefId,
    projectId,
    input,
  };

  return {
    decisions: [decision],
    events: [
      {
        type: 'planning.memory_extraction.planned',
        payload: {
          turnId,
          workflowDefId: memoryExtractionWorkflowDefId,
          moveCount: transcript.length,
        },
      },
    ],
  };
}
