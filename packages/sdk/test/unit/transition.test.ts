/**
 * Unit tests for transition builder
 */

import { describe, expect, it } from 'vitest';
import { transition } from '../../src/builders/transition';

describe('transition()', () => {
  it('creates transition with required fields', () => {
    const result = transition({
      fromNodeRef: 'start',
      toNodeRef: 'end',
      priority: 1,
    });

    expect(result).toEqual({
      fromNodeRef: 'start',
      toNodeRef: 'end',
      priority: 1,
    });
  });

  it('creates transition with condition', () => {
    const result = transition({
      fromNodeRef: 'check',
      toNodeRef: 'process',
      priority: 1,
      condition: {
        expression: '$.check.success == true',
      },
    });

    expect(result).toEqual({
      fromNodeRef: 'check',
      toNodeRef: 'process',
      priority: 1,
      condition: {
        expression: '$.check.success == true',
      },
    });
  });

  it('creates transition with ref', () => {
    const result = transition({
      ref: 'my-transition',
      fromNodeRef: 'a',
      toNodeRef: 'b',
      priority: 1,
    });

    expect(result).toEqual({
      ref: 'my-transition',
      fromNodeRef: 'a',
      toNodeRef: 'b',
      priority: 1,
    });
  });

  it('creates transition with spawnCount', () => {
    const result = transition({
      fromNodeRef: 'fan-out',
      toNodeRef: 'worker',
      priority: 1,
      spawnCount: 5,
    });

    expect(result).toEqual({
      fromNodeRef: 'fan-out',
      toNodeRef: 'worker',
      priority: 1,
      spawnCount: 5,
    });
  });

  it('creates transition with foreach', () => {
    const result = transition({
      fromNodeRef: 'iterate',
      toNodeRef: 'process',
      priority: 1,
      foreach: {
        items: '$.input.items',
      },
    });

    expect(result).toEqual({
      fromNodeRef: 'iterate',
      toNodeRef: 'process',
      priority: 1,
      foreach: {
        items: '$.input.items',
      },
    });
  });

  it('creates transition with synchronization', () => {
    const result = transition({
      fromNodeRef: 'parallel',
      toNodeRef: 'join',
      priority: 1,
      synchronization: {
        wait_for: ['task1', 'task2'],
      },
    });

    expect(result).toEqual({
      fromNodeRef: 'parallel',
      toNodeRef: 'join',
      priority: 1,
      synchronization: {
        wait_for: ['task1', 'task2'],
      },
    });
  });

  it('creates transition with loopConfig', () => {
    const result = transition({
      fromNodeRef: 'loop-start',
      toNodeRef: 'loop-body',
      priority: 1,
      loopConfig: {
        max_iterations: 10,
      },
    });

    expect(result).toEqual({
      fromNodeRef: 'loop-start',
      toNodeRef: 'loop-body',
      priority: 1,
      loopConfig: {
        max_iterations: 10,
      },
    });
  });

  it('creates transition with all fields', () => {
    const result = transition({
      ref: 'complex-transition',
      fromNodeRef: 'source',
      toNodeRef: 'target',
      priority: 5,
      condition: {
        expression: 'true',
      },
      spawnCount: 3,
      foreach: {
        items: '$.items',
      },
      synchronization: {
        wait_for: ['node1'],
      },
      loopConfig: {
        max_iterations: 5,
      },
    });

    expect(result).toEqual({
      ref: 'complex-transition',
      fromNodeRef: 'source',
      toNodeRef: 'target',
      priority: 5,
      condition: {
        expression: 'true',
      },
      spawnCount: 3,
      foreach: {
        items: '$.items',
      },
      synchronization: {
        wait_for: ['node1'],
      },
      loopConfig: {
        max_iterations: 5,
      },
    });
  });
});
