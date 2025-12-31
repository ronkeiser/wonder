import { describe, expect, it } from 'vitest';
import { resolveTools, type Tool } from '../../src/planning/tools';

describe('resolveTools', () => {
  it('returns empty results for empty input', () => {
    const result = resolveTools([]);

    expect(result.specs).toEqual([]);
    expect(result.lookup.size).toBe(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('planning.tools.resolved');
    expect(result.events[0].payload).toEqual({ count: 0, names: [] });
  });

  it('transforms tools to LLM specs', () => {
    const tools: Tool[] = [
      {
        id: 'tool_search',
        name: 'search',
        description: 'Search the codebase',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        targetType: 'task',
        targetId: 'task_search',
      },
    ];

    const result = resolveTools(tools);

    expect(result.specs).toEqual([
      {
        name: 'search',
        description: 'Search the codebase',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ]);
  });

  it('builds lookup map by name', () => {
    const tools: Tool[] = [
      {
        id: 'tool_search',
        name: 'search',
        description: 'Search',
        inputSchema: {},
        targetType: 'task',
        targetId: 'task_search',
      },
      {
        id: 'tool_implement',
        name: 'implement',
        description: 'Implement feature',
        inputSchema: {},
        targetType: 'workflow',
        targetId: 'workflow_implement',
        async: true,
      },
    ];

    const result = resolveTools(tools);

    expect(result.lookup.size).toBe(2);
    expect(result.lookup.get('search')).toBe(tools[0]);
    expect(result.lookup.get('implement')).toBe(tools[1]);
  });

  it('emits resolved event with tool names', () => {
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

    const result = resolveTools(tools);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].payload).toEqual({
      count: 2,
      names: ['tool_a', 'tool_b'],
    });
  });
});
