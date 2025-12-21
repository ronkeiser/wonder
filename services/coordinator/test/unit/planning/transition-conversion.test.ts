/**
 * Unit tests for planning/synchronization.ts helper functions
 *
 * Tests getMergeConfig which extracts merge configuration from transitions.
 */

import { describe, expect, it } from 'vitest';
import { getMergeConfig } from '../../../src/planning/synchronization.js';
import type { Transition } from '../../../src/types.js';

describe('getMergeConfig', () => {
  it('returns null when synchronization is null', () => {
    const transition = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: null,
    } as Transition;

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns null when synchronization has no merge config', () => {
    const transition = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
      },
    } as Transition;

    expect(getMergeConfig(transition)).toBeNull();
  });

  it('returns merge config when present', () => {
    const merge = {
      source: '_branch.output.vote',
      target: 'state.votes',
      strategy: 'append' as const,
    };

    const transition = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fan-out-1',
        merge,
      },
    } as Transition;

    expect(getMergeConfig(transition)).toEqual(merge);
  });

  it('returns merge config with merge_object strategy', () => {
    const merge = {
      source: '_branch.output',
      target: 'state.combined',
      strategy: 'merge_object' as const,
    };

    const transition = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'fan-out-1',
        merge,
      },
    } as Transition;

    expect(getMergeConfig(transition)).toEqual(merge);
  });

  it('returns merge config with keyed_by_branch strategy', () => {
    const merge = {
      source: '_branch.output.result',
      target: 'state.branch_results',
      strategy: 'keyed_by_branch' as const,
    };

    const transition = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: { mOfN: 2 },
        siblingGroup: 'fan-out-1',
        merge,
      },
    } as Transition;

    expect(getMergeConfig(transition)).toEqual(merge);
  });

  it('returns merge config with last_wins strategy', () => {
    const merge = {
      source: '_branch.output',
      target: 'state.final',
      strategy: 'last_wins' as const,
    };

    const transition = {
      id: 'trans-1',
      fromNodeId: 'a',
      toNodeId: 'b',
      priority: 0,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'fan-out-1',
        timeoutMs: 5000,
        onTimeout: 'proceed_with_available',
        merge,
      },
    } as Transition;

    expect(getMergeConfig(transition)).toEqual(merge);
  });
});