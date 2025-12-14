/**
 * Unit tests for planning/routing.ts helper functions
 *
 * Tests toTransitionDef and getMergeConfig which convert database rows
 * to type-safe planning types.
 */

import { describe, expect, it } from 'vitest';
import { getMergeConfig, toTransitionDef } from '../../../src/planning/routing.js';
import type { TransitionDef } from '../../../src/types.js';

// Mock TransitionRow type (matches drizzle schema inference)
type TransitionRow = {
  id: string;
  ref: string | null;
  workflow_def_id: string;
  workflow_def_version: number;
  from_node_id: string;
  to_node_id: string;
  priority: number;
  condition: object | null;
  spawn_count: number | null;
  foreach: object | null;
  synchronization: object | null;
  loop_config: object | null;
};

describe('toTransitionDef', () => {
  it('converts minimal TransitionRow with null optionals', () => {
    const row: TransitionRow = {
      id: 'trans-1',
      ref: null,
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      from_node_id: 'node-a',
      to_node_id: 'node-b',
      priority: 0,
      condition: null,
      spawn_count: null,
      foreach: null,
      synchronization: null,
      loop_config: null,
    };

    const result = toTransitionDef(row);

    expect(result).toEqual({
      id: 'trans-1',
      ref: null,
      from_node_id: 'node-a',
      to_node_id: 'node-b',
      priority: 0,
      condition: null,
      spawn_count: null,
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
      from_node_id: 'approval',
      to_node_id: 'review',
      priority: 1,
      condition: null,
      spawn_count: null,
      foreach: null,
      synchronization: null,
      loop_config: null,
    };

    const result = toTransitionDef(row);

    expect(result.ref).toBe('approval-to-review');
    expect(result.priority).toBe(1);
  });

  it('converts TransitionRow with spawn_count', () => {
    const row: TransitionRow = {
      id: 'fan-out-trans',
      ref: 'parallel-judges',
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      from_node_id: 'input',
      to_node_id: 'judge',
      priority: 0,
      condition: null,
      spawn_count: 3,
      foreach: null,
      synchronization: null,
      loop_config: null,
    };

    const result = toTransitionDef(row);

    expect(result.spawn_count).toBe(3);
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
      from_node_id: 'score',
      to_node_id: 'pass',
      priority: 0,
      condition,
      spawn_count: null,
      foreach: null,
      synchronization: null,
      loop_config: null,
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
      from_node_id: 'input',
      to_node_id: 'evaluate',
      priority: 0,
      condition: null,
      spawn_count: null,
      foreach,
      synchronization: null,
      loop_config: null,
    };

    const result = toTransitionDef(row);

    expect(result.foreach).toEqual(foreach);
  });

  it('converts TransitionRow with synchronization config', () => {
    const synchronization = {
      strategy: 'all' as const,
      sibling_group: 'fan-out-trans',
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
      from_node_id: 'evaluate',
      to_node_id: 'aggregate',
      priority: 0,
      condition: null,
      spawn_count: null,
      foreach: null,
      synchronization,
      loop_config: null,
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
      from_node_id: 'node-a',
      to_node_id: 'node-b',
      priority: 0,
      condition: null,
      spawn_count: null,
      foreach: null,
      synchronization: null,
      loop_config: null,
    };

    const result = toTransitionDef(row);

    expect(result).not.toHaveProperty('workflow_def_id');
    expect(result).not.toHaveProperty('workflow_def_version');
  });

  it('strips loop_config from output', () => {
    const row: TransitionRow = {
      id: 'trans-1',
      ref: null,
      workflow_def_id: 'wf-1',
      workflow_def_version: 1,
      from_node_id: 'node-a',
      to_node_id: 'node-b',
      priority: 0,
      condition: null,
      spawn_count: null,
      foreach: null,
      synchronization: null,
      loop_config: { max_iterations: 10 },
    };

    const result = toTransitionDef(row);

    expect(result).not.toHaveProperty('loop_config');
  });
});

describe('getMergeConfig', () => {
  it('returns null when synchronization is null', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      from_node_id: 'a',
      to_node_id: 'b',
      priority: 0,
      synchronization: null,
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns null when synchronization is undefined', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      from_node_id: 'a',
      to_node_id: 'b',
      priority: 0,
    };

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns null when synchronization has no merge config', () => {
    const transition: TransitionDef = {
      id: 'trans-1',
      from_node_id: 'a',
      to_node_id: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        sibling_group: 'fan-out-1',
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
      from_node_id: 'a',
      to_node_id: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        sibling_group: 'fan-out-1',
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
      from_node_id: 'a',
      to_node_id: 'b',
      priority: 0,
      synchronization: {
        strategy: 'any',
        sibling_group: 'fan-out-1',
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
      from_node_id: 'a',
      to_node_id: 'b',
      priority: 0,
      synchronization: {
        strategy: { m_of_n: 2 },
        sibling_group: 'fan-out-1',
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
      from_node_id: 'a',
      to_node_id: 'b',
      priority: 0,
      synchronization: {
        strategy: 'any',
        sibling_group: 'fan-out-1',
        timeout_ms: 5000,
        on_timeout: 'proceed_with_available',
        merge,
      },
    };

    expect(getMergeConfig(transition)).toEqual(merge);
  });
});
