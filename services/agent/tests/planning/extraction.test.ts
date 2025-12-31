import { describe, expect, it } from 'vitest';
import { decideMemoryExtraction, type MemoryExtractionParams } from '../../src/planning/extraction';

describe('decideMemoryExtraction', () => {
  const baseParams: MemoryExtractionParams = {
    turnId: 'turn_123',
    agentId: 'agent_456',
    transcript: [
      { sequence: 0, reasoning: 'Let me help you with that.' },
      { sequence: 1, toolCall: { toolId: 'search', input: { query: 'foo' } } },
      { sequence: 2, toolResult: { results: [] } },
    ],
    memoryExtractionWorkflowId: 'workflow_memory_extraction_v1',
  };

  it('generates DISPATCH_MEMORY_EXTRACTION decision', () => {
    const result = decideMemoryExtraction(baseParams);

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toEqual({
      type: 'DISPATCH_MEMORY_EXTRACTION',
      turnId: 'turn_123',
      workflowId: 'workflow_memory_extraction_v1',
      input: {
        agentId: 'agent_456',
        turnId: 'turn_123',
        transcript: baseParams.transcript,
      },
    });
  });

  it('skips dispatch for empty transcript', () => {
    const params: MemoryExtractionParams = {
      ...baseParams,
      transcript: [],
    };

    const result = decideMemoryExtraction(params);

    expect(result.decisions).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('planning.memory_extraction.skipped');
    expect(result.events[0].payload).toEqual({
      turnId: 'turn_123',
      reason: 'empty_transcript',
    });
  });

  it('emits planned event with move count', () => {
    const result = decideMemoryExtraction(baseParams);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('planning.memory_extraction.planned');
    expect(result.events[0].payload).toEqual({
      turnId: 'turn_123',
      workflowId: 'workflow_memory_extraction_v1',
      moveCount: 3,
    });
  });
});
