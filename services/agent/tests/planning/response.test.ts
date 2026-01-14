import { describe, expect, it } from 'vitest';
import { interpretResponse, type LLMResponse } from '../../src/planning/response';
import type { Tool } from '../../src/planning/tools';

describe('interpretResponse', () => {
  const createToolLookup = (tools: Tool[]): Map<string, Tool> => {
    return new Map(tools.map((t) => [t.name, t]));
  };

  describe('text responses', () => {
    it('generates APPEND_MESSAGE for text content', () => {
      const response: LLMResponse = {
        text: 'Hello, how can I help?',
        stopReason: 'end_turn',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: new Map(),
      });

      expect(result.decisions).toContainEqual({
        type: 'APPEND_MESSAGE',
        turnId: 'turn_123',
        role: 'agent',
        content: 'Hello, how can I help?',
      });
    });

    it('handles empty text', () => {
      const response: LLMResponse = {
        stopReason: 'end_turn',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: new Map(),
      });

      expect(result.decisions.filter((d) => d.type === 'APPEND_MESSAGE')).toHaveLength(0);
    });
  });

  describe('tool dispatch', () => {
    it('generates DISPATCH_TASK for task tools', () => {
      const tools: Tool[] = [
        {
          id: 'tool_search',
          name: 'search',
          description: 'Search',
          inputSchema: {},
          targetType: 'task',
          targetId: 'task_search',
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'search', input: { query: 'foo' } }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      expect(result.decisions).toContainEqual(
        expect.objectContaining({
          type: 'DISPATCH_TASK',
          turnId: 'turn_123',
          toolCallId: 'call_1',
          taskId: 'task_search',
          input: { query: 'foo' },
          async: false,
        }),
      );
    });

    it('generates DISPATCH_WORKFLOW for workflow tools', () => {
      const tools: Tool[] = [
        {
          id: 'tool_implement',
          name: 'implement',
          description: 'Implement',
          inputSchema: {},
          targetType: 'workflow',
          targetId: 'workflow_implement',
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'implement', input: { feature: 'auth' } }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      expect(result.decisions).toContainEqual(
        expect.objectContaining({
          type: 'DISPATCH_WORKFLOW',
          turnId: 'turn_123',
          toolCallId: 'call_1',
          workflowId: 'workflow_implement',
          input: { feature: 'auth' },
          async: false,
        }),
      );
    });

    it('generates DISPATCH_AGENT for agent tools', () => {
      const tools: Tool[] = [
        {
          id: 'tool_reviewer',
          name: 'ask_reviewer',
          description: 'Ask reviewer',
          inputSchema: {},
          targetType: 'agent',
          targetId: 'agent_reviewer',
          invocationMode: 'delegate',
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'ask_reviewer', input: { code: '...' } }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      expect(result.decisions).toContainEqual(
        expect.objectContaining({
          type: 'DISPATCH_AGENT',
          turnId: 'turn_123',
          toolCallId: 'call_1',
          agentId: 'agent_reviewer',
          input: { code: '...' },
          mode: 'delegate',
          async: false,
        }),
      );
    });
  });

  describe('async tools', () => {
    it('sets async flag on workflow dispatch', () => {
      const tools: Tool[] = [
        {
          id: 'tool_research',
          name: 'research',
          description: 'Research',
          inputSchema: {},
          targetType: 'workflow',
          targetId: 'workflow_research',
          async: true,
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'research', input: {} }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      const dispatch = result.decisions.find((d) => d.type === 'DISPATCH_WORKFLOW');
      expect(dispatch).toBeDefined();
      if (dispatch?.type === 'DISPATCH_WORKFLOW') {
        expect(dispatch.async).toBe(true);
      }
    });
  });

  describe('unknown tools', () => {
    it('generates error result for unknown tool', () => {
      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'unknown_tool', input: {} }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: new Map(),
      });

      expect(result.decisions).toContainEqual({
        type: 'ASYNC_OP_COMPLETED',
        turnId: 'turn_123',
        operationId: 'call_1',
        result: {
          toolCallId: 'call_1',
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Unknown tool: unknown_tool',
            retriable: false,
          },
        },
      });

      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'planning.response.unknown_tool',
        })
      );
    });
  });

  describe('input mapping', () => {
    it('applies input mapping when defined', () => {
      const tools: Tool[] = [
        {
          id: 'tool_search',
          name: 'search',
          description: 'Search',
          inputSchema: {},
          targetType: 'task',
          targetId: 'task_search',
          inputMapping: { searchQuery: 'query' },
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'search', input: { query: 'foo' } }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      const dispatch = result.decisions.find((d) => d.type === 'DISPATCH_TASK');
      expect(dispatch).toBeDefined();
      if (dispatch?.type === 'DISPATCH_TASK') {
        expect(dispatch.input).toEqual({ searchQuery: 'foo' });
      }
    });
  });

  describe('multiple tool calls', () => {
    it('handles multiple tool calls', () => {
      const tools: Tool[] = [
        {
          id: 'tool_a',
          name: 'tool_a',
          description: 'A',
          inputSchema: {},
          targetType: 'task',
          targetId: 'task_a',
        },
        {
          id: 'tool_b',
          name: 'tool_b',
          description: 'B',
          inputSchema: {},
          targetType: 'task',
          targetId: 'task_b',
        },
      ];

      const response: LLMResponse = {
        toolUse: [
          { id: 'call_1', name: 'tool_a', input: {} },
          { id: 'call_2', name: 'tool_b', input: {} },
        ],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      const dispatches = result.decisions.filter((d) => d.type === 'DISPATCH_TASK');
      expect(dispatches).toHaveLength(2);
    });
  });

  describe('input validation', () => {
    it('generates error result for invalid input', () => {
      const tools: Tool[] = [
        {
          id: 'tool_search',
          name: 'search',
          description: 'Search',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
          targetType: 'task',
          targetId: 'task_search',
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'search', input: {} }], // Missing required 'query'
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      // Should have error result, not dispatch
      const errorDecision = result.decisions.find((d) => d.type === 'ASYNC_OP_COMPLETED');
      expect(errorDecision).toBeDefined();
      if (errorDecision?.type === 'ASYNC_OP_COMPLETED') {
        expect(errorDecision.result.success).toBe(false);
        expect(errorDecision.result.error?.code).toBe('INVALID_INPUT');
      }

      // Should emit invalid_input event
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'planning.response.invalid_input',
        })
      );

      // Should NOT have dispatch decision
      expect(result.decisions.find((d) => d.type === 'DISPATCH_TASK')).toBeUndefined();
    });

    it('allows valid input', () => {
      const tools: Tool[] = [
        {
          id: 'tool_search',
          name: 'search',
          description: 'Search',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
          targetType: 'task',
          targetId: 'task_search',
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'search', input: { query: 'hello' } }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      // Should have dispatch, not error
      expect(result.decisions.find((d) => d.type === 'DISPATCH_TASK')).toBeDefined();
      expect(result.decisions.find((d) => d.type === 'ASYNC_OP_COMPLETED')).toBeUndefined();
    });

    it('skips validation for schemas without type', () => {
      const tools: Tool[] = [
        {
          id: 'tool_search',
          name: 'search',
          description: 'Search',
          inputSchema: {}, // No type defined - permissive
          targetType: 'task',
          targetId: 'task_search',
        },
      ];

      const response: LLMResponse = {
        toolUse: [{ id: 'call_1', name: 'search', input: { anything: 123 } }],
        stopReason: 'tool_use',
      };

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      // Should dispatch without validation error
      expect(result.decisions.find((d) => d.type === 'DISPATCH_TASK')).toBeDefined();
    });
  });

  describe('events', () => {
    it('emits interpreted event', () => {
      const response: LLMResponse = {
        text: 'Hello',
        toolUse: [{ id: 'call_1', name: 'search', input: {} }],
        stopReason: 'tool_use',
      };

      const tools: Tool[] = [
        {
          id: 'tool_search',
          name: 'search',
          description: 'Search',
          inputSchema: {},
          targetType: 'task',
          targetId: 'task_search',
        },
      ];

      const result = interpretResponse({
        turnId: 'turn_123',
        response,
        toolLookup: createToolLookup(tools),
      });

      expect(result.events).toContainEqual({
        type: 'planning.response.interpreted',
        payload: {
          turnId: 'turn_123',
          hasText: true,
          toolCallCount: 1,
          stopReason: 'tool_use',
        },
      });
    });
  });
});
