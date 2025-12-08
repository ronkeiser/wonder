/**
 * Unit tests for transition builder
 */

import { describe, expect, it } from 'vitest';
import { transition } from '../../src/builders/transition';

describe('transition()', () => {
  it('creates transition with required fields', () => {
    const result = transition({
      from_node_ref: 'start',
      to_node_ref: 'end',
      priority: 1,
    });

    expect(result).toEqual({
      from_node_ref: 'start',
      to_node_ref: 'end',
      priority: 1,
    });
  });

  it('creates transition with condition', () => {
    const result = transition({
      from_node_ref: 'check',
      to_node_ref: 'process',
      priority: 1,
      condition: {
        expression: '$.check.success == true',
      },
    });

    expect(result).toEqual({
      from_node_ref: 'check',
      to_node_ref: 'process',
      priority: 1,
      condition: {
        expression: '$.check.success == true',
      },
    });
  });

  it('creates transition with ref', () => {
    const result = transition({
      ref: 'my-transition',
      from_node_ref: 'a',
      to_node_ref: 'b',
      priority: 1,
    });

    expect(result).toEqual({
      ref: 'my-transition',
      from_node_ref: 'a',
      to_node_ref: 'b',
      priority: 1,
    });
  });

  it('creates transition with spawn_count', () => {
    const result = transition({
      from_node_ref: 'fan-out',
      to_node_ref: 'worker',
      priority: 1,
      spawn_count: 5,
    });

    expect(result).toEqual({
      from_node_ref: 'fan-out',
      to_node_ref: 'worker',
      priority: 1,
      spawn_count: 5,
    });
  });

  it('creates transition with foreach', () => {
    const result = transition({
      from_node_ref: 'iterate',
      to_node_ref: 'process',
      priority: 1,
      foreach: {
        items: '$.input.items',
      },
    });

    expect(result).toEqual({
      from_node_ref: 'iterate',
      to_node_ref: 'process',
      priority: 1,
      foreach: {
        items: '$.input.items',
      },
    });
  });

  it('creates transition with synchronization', () => {
    const result = transition({
      from_node_ref: 'parallel',
      to_node_ref: 'join',
      priority: 1,
      synchronization: {
        wait_for: ['task1', 'task2'],
      },
    });

    expect(result).toEqual({
      from_node_ref: 'parallel',
      to_node_ref: 'join',
      priority: 1,
      synchronization: {
        wait_for: ['task1', 'task2'],
      },
    });
  });

  it('creates transition with loop_config', () => {
    const result = transition({
      from_node_ref: 'loop-start',
      to_node_ref: 'loop-body',
      priority: 1,
      loop_config: {
        max_iterations: 10,
      },
    });

    expect(result).toEqual({
      from_node_ref: 'loop-start',
      to_node_ref: 'loop-body',
      priority: 1,
      loop_config: {
        max_iterations: 10,
      },
    });
  });

  it('creates transition with all fields', () => {
    const result = transition({
      ref: 'complex-transition',
      from_node_ref: 'source',
      to_node_ref: 'target',
      priority: 5,
      condition: {
        expression: 'true',
      },
      spawn_count: 3,
      foreach: {
        items: '$.items',
      },
      synchronization: {
        wait_for: ['node1'],
      },
      loop_config: {
        max_iterations: 5,
      },
    });

    expect(result).toEqual({
      ref: 'complex-transition',
      from_node_ref: 'source',
      to_node_ref: 'target',
      priority: 5,
      condition: {
        expression: 'true',
      },
      spawn_count: 3,
      foreach: {
        items: '$.items',
      },
      synchronization: {
        wait_for: ['node1'],
      },
      loop_config: {
        max_iterations: 5,
      },
    });
  });
});
