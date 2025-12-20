/**
 * Unit tests for planning/routing.ts helper functions
 *
 * Tests toTransitionDef and getMergeConfig which convert database rows
 * to type-safe planning types.
 */

import { describe, expect, it } from 'vitest';
import { toTransitionDef } from '../../../src/planning/routing.js';
import { getMergeConfig } from '../../../src/planning/synchronization.js';
import type { TransitionDef } from '../../../src/types.js';

// Mock TransitionRow type (matches drizzle schema inference)
type TransitionRow = {
  id: string;
  ref: string | null;
  workflow_def_id: string;
  workflow_def_version: number;
  fromNodeId: string;
  toNodeId: string;
  priority: number;
  condition: object | null;
  spawnCount: number | null;
  siblingGroup: string | null;
  foreach: object | null;
  synchronization: object | null;
  loopConfig: object | null;
};

describe('toTransitionDef', () => {
  it('converts minimal TransitionRow with null optionals', () => {
    const row: TransitionRow = {
      id: 'trans-1',
      ref: null,
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      fromNodeId: 'node-a',
      toNodeId: 'node-b',
      priority: 0,
      condition: null,
      spawnCount: null,
      siblingGroup: null,
      foreach: null,
      synchronization: null,
      loopConfig: null,
    };

    const result = toTransitionDef(row);

    expect(result).toEqual({
      id: 'trans-1',
      ref: undefined,
      fromNodeId: 'node-a',
      toNodeId: 'node-b',
      priority: 0,
      condition: null,
      spawnCount: undefined,
      siblingGroup: undefined,
      foreach: null,
      synchronization: null,
    });
  });

  it('converts TransitionRow with ref', () => {
    const row: TransitionRow = {
      id: 'trans-2',
      ref: 'approval-to-review',
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      fromNodeId: 'approval',
      toNodeId: 'review',
      priority: 1,
      condition: null,
      spawnCount: null,
      siblingGroup: null,
      foreach: null,
      synchronization: null,
      loopConfig: null,
    };

    const result = toTransitionDef(row);

    expect(result.ref).toBe('approval-to-review');
    expect(result.priority).toBe(1);
  });

  it('converts TransitionRow with spawnCount', () => {
    const row: TransitionRow = {
      id: 'fan-out-trans',
      ref: 'parallel-judges',
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      fromNodeId: 'input',
      toNodeId: 'judge',
      priority: 0,
      condition: null,
      spawnCount: 3,
      siblingGroup: null,
      foreach: null,
      synchronization: null,
      loopConfig: null,
    };

    const result = toTransitionDef(row);

    expect(result.spawnCount).toBe(3);
  });

  it('converts TransitionRow with condition', () => {
    const condition = {
      type: 'comparison' as const,
      left: { field: 'state.score' },
      operator: '>=' as const,
      right: { literal: 80 },
    };

    const row: TransitionRow = {
      id: 'conditional-trans',
      ref: 'pass-if-score-high',
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      fromNodeId: 'score',
      toNodeId: 'pass',
      priority: 0,
      condition,
      spawnCount: null,
      siblingGroup: null,
      foreach: null,
      synchronization: null,
      loopConfig: null,
    };

    const result = toTransitionDef(row);

    expect(result.condition).toEqual(condition);
  });

  it('converts TransitionRow with foreach config', () => {
    const foreach = {
      collection: 'input.judges',
      item_var: 'judge',
    };

    const row: TransitionRow = {
      id: 'foreach-trans',
      ref: 'iterate-judges',
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      fromNodeId: 'input',
      toNodeId: 'evaluate',
      priority: 0,
      condition: null,
      spawnCount: null,
      siblingGroup: null,
      foreach,
      synchronization: null,
      loopConfig: null,
    };

    const result = toTransitionDef(row);

    expect(result.foreach).toEqual(foreach);
  });

  it('converts TransitionRow with synchronization config', () => {
    const synchronization = {
      strategy: 'all' as const,
      siblingGroup: 'fan-out-trans',
      timeout_ms: 30000,
      on_timeout: 'fail' as const,
      merge: {
        source: '_branch.output',
        target: 'state.results',
        strategy: 'append' as const,
      },
    };

    const row: TransitionRow = {
      id: 'sync-trans',
      ref: 'collect-results',
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      fromNodeId: 'evaluate',
      toNodeId: 'aggregate',
      priority: 0,
      condition: null,
      spawnCount: null,
      siblingGroup: null,
      foreach: null,
      synchronization,
      loopConfig: null,
    };

    const result = toTransitionDef(row);

    expect(result.synchronization).toEqual(synchronization);
  });

  it('strips workflow_def_id and workflow_def_version from output', () => {
    const row: TransitionRow = {
      id: 'trans-1',
      ref: null,
      workflow_def_id: 'should-not-appear',
      workflow_def_version: 99,
      fromNodeId: 'node-a',
      toNodeId: 'node-b',
      priority: 0,
      condition: null,
      spawnCount: null,
      siblingGroup: null,
      foreach: null,
      synchronization: null,
      loopConfig: null,
    };

    const result = toTransitionDef(row);

    expect(result).not.toHaveProperty('workflow_def_id');
    expect(result).not.toHaveProperty('workflow_def_version');
  });

  it('strips loopConfig from output', () => {
    const row: TransitionRow = {
      id: 'trans-1',
      ref: null,
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      fromNodeId: 'node-a',
      toNodeId: 'node-b',
      priority: 0,
      condition: null,
      spawnCount: null,
      siblingGroup: null,
      foreach: null,
      synchronization: null,
      loopConfig: { max_iterations: 10 },
    };

    const result = toTransitionDef(row);

    expect(result).not.toHaveProperty('loopConfig');
  });
});

describe('getMergeConfig', () => {
  it('returns null when synchronization is null', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: null,
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns null when synchronization is undefined', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns null when synchronization has no merge config', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
      },
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns merge config when present', () => {
    const merge = {
      source: '_branch.output.vote',
      target: 'state.votes',
      strategy: 'append' as const,
    };

    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
        merge,
      },
    };

    expect(getMergeConfig(transition)).toEqual(merge);
  });

  it('returns merge config with merge_object strategy', () => {
    const merge = {
      source: '_branch.output',
      target: 'state.combined',
      strategy: 'merge_object' as const,
    };

    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'fan-out-1',
        merge,
      },
    };

    expect(getMergeConfig(transition)).toEqual(merge);
  });

  it('returns merge config with keyed_by_branch strategy', () => {
    const merge = {
      source: '_branch.output.result',
      target: 'state.branch_results',
      strategy: 'keyed_by_branch' as const,
    };

    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: { mOfN: 2 },
        siblingGroup: 'fan-out-1',
        merge,
      },
    };

    expect(getMergeConfig(transition)).toEqual(merge);
  });

  it('returns merge config with last_wins strategy', () => {
    const merge = {
      source: '_branch.output',
      target: 'state.final',
      strategy: 'last_wins' as const,
    };

    const transition: TransitionDef = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'fan-out-1',
        timeout_ms: 5000,
        on_timeout: 'proceed_with_available',
        merge,
      },
    };

    expect(getMergeConfig(transition)).toEqual(merge);
  });
});
