import { describe, expect, it } from 'vitest';
import { decideContextAssembly, type ContextAssemblyParams } from '../../src/planning/context';

describe('decideContextAssembly', () => {
  const baseParams: ContextAssemblyParams = {
    turnId: 'turn_123',
    conversationId: 'conv_456',
    userMessage: 'Hello',
    recentTurns: [],
    contextAssemblyWorkflowId: 'workflow_context_assembly_v1',
    modelProfileId: 'profile_claude',
    toolIds: ['tool_search', 'tool_implement'],
  };

  it('generates DISPATCH_CONTEXT_ASSEMBLY decision', () => {
    const result = decideContextAssembly(baseParams);

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toEqual({
      type: 'DISPATCH_CONTEXT_ASSEMBLY',
      turnId: 'turn_123',
      workflowId: 'workflow_context_assembly_v1',
      input: {
        conversationId: 'conv_456',
        userMessage: 'Hello',
        recentTurns: [],
        modelProfileId: 'profile_claude',
        toolIds: ['tool_search', 'tool_implement'],
      },
    });
  });

  it('includes recent turns in input', () => {
    const params: ContextAssemblyParams = {
      ...baseParams,
      recentTurns: [
        {
          id: 'turn_prev',
          input: 'Previous message',
          moves: [{ sequence: 0, reasoning: 'Response' }],
          completedAt: '2024-01-01T00:00:00Z',
        },
      ],
    };

    const result = decideContextAssembly(params);
    const decision = result.decisions[0];

    if (decision.type === 'DISPATCH_CONTEXT_ASSEMBLY') {
      expect(decision.input.recentTurns).toHaveLength(1);
      expect(decision.input.recentTurns[0].id).toBe('turn_prev');
    }
  });

  it('emits planned event with metadata', () => {
    const params: ContextAssemblyParams = {
      ...baseParams,
      recentTurns: [
        { id: 't1', input: '', moves: [], completedAt: null },
        { id: 't2', input: '', moves: [], completedAt: null },
      ],
      toolIds: ['a', 'b', 'c'],
    };

    const result = decideContextAssembly(params);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('planning.context_assembly.planned');
    expect(result.events[0].payload).toEqual({
      turnId: 'turn_123',
      workflowId: 'workflow_context_assembly_v1',
      recentTurnsCount: 2,
      toolCount: 3,
    });
  });
});
