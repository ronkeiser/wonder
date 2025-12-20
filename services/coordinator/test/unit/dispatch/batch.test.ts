/**
 * Unit tests for decision batching.
 *
 * Tests:
 * - batchDecisions: Combines compatible decisions for efficiency
 * - countBatchedDecisions: Metrics for batching reduction
 * - isBatchable: Identifies batchable decision types
 * - extractAffectedTokenIds: Collects token IDs from decisions
 * - groupByType: Groups decisions by type
 */

import { describe, expect, it } from 'vitest';
import {
  batchDecisions,
  countBatchedDecisions,
  extractAffectedTokenIds,
  groupByType,
  isBatchable,
} from '../../../src/dispatch/batch';
import type { CreateTokenParams } from '../../../src/operations/tokens';
import type { Decision } from '../../../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTokenParams(overrides: Partial<CreateTokenParams> = {}): CreateTokenParams {
  return {
    workflow_run_id: 'run-1',
    node_id: 'nodeA',
    path_id: 'root.nodeA.0',
    parent_token_id: null,
    branch_index: 0,
    branch_total: 1,
    ...overrides,
  };
}

// ============================================================================
// batchDecisions Tests
// ============================================================================

describe('batchDecisions', () => {
  describe('empty and single', () => {
    it('returns empty array for empty input', () => {
      expect(batchDecisions([])).toEqual([]);
    });

    it('passes through single CREATE_TOKEN unchanged', () => {
      const decisions: Decision[] = [{ type: 'CREATE_TOKEN', params: createTokenParams() }];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CREATE_TOKEN');
    });

    it('passes through single UPDATE_TOKEN_STATUS unchanged', () => {
      const decisions: Decision[] = [
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'tok-1',
        status: 'completed',
      });
    });

    it('passes through single non-batchable decision unchanged', () => {
      const decisions: Decision[] = [{ type: 'COMPLETE_WORKFLOW', output: { result: 'done' } }];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'COMPLETE_WORKFLOW',
        output: { result: 'done' },
      });
    });
  });

  describe('CREATE_TOKEN batching', () => {
    it('batches two CREATE_TOKEN into BATCH_CREATE_TOKENS', () => {
      const decisions: Decision[] = [
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'A' }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'B' }) },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('BATCH_CREATE_TOKENS');
      if (result[0].type === 'BATCH_CREATE_TOKENS') {
        expect(result[0].allParams).toHaveLength(2);
        expect(result[0].allParams[0].node_id).toBe('A');
        expect(result[0].allParams[1].node_id).toBe('B');
      }
    });

    it('batches multiple CREATE_TOKEN into single BATCH_CREATE_TOKENS', () => {
      const decisions: Decision[] = [
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 0 }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 1 }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 2 }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 3 }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 4 }) },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('BATCH_CREATE_TOKENS');
      if (result[0].type === 'BATCH_CREATE_TOKENS') {
        expect(result[0].allParams).toHaveLength(5);
      }
    });

    it('preserves already-batched BATCH_CREATE_TOKENS', () => {
      const decisions: Decision[] = [
        {
          type: 'BATCH_CREATE_TOKENS',
          allParams: [createTokenParams({ node_id: 'A' }), createTokenParams({ node_id: 'B' })],
        },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('BATCH_CREATE_TOKENS');
    });
  });

  describe('UPDATE_TOKEN_STATUS batching', () => {
    it('batches two UPDATE_TOKEN_STATUS with same status', () => {
      const decisions: Decision[] = [
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'completed' },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('BATCH_UPDATE_STATUS');
      if (result[0].type === 'BATCH_UPDATE_STATUS') {
        expect(result[0].updates).toHaveLength(2);
        expect(result[0].updates[0]).toEqual({ tokenId: 'tok-1', status: 'completed' });
        expect(result[0].updates[1]).toEqual({ tokenId: 'tok-2', status: 'completed' });
      }
    });

    it('does NOT batch UPDATE_TOKEN_STATUS with different statuses', () => {
      const decisions: Decision[] = [
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'failed' },
      ];

      const result = batchDecisions(decisions);

      // Different statuses = separate decisions
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'tok-1',
        status: 'completed',
      });
      expect(result[1]).toEqual({
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'tok-2',
        status: 'failed',
      });
    });

    it('batches consecutive same-status, then separate different-status', () => {
      const decisions: Decision[] = [
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'completed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-3', status: 'completed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-4', status: 'failed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-5', status: 'failed' },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(2);

      // First batch: completed
      expect(result[0].type).toBe('BATCH_UPDATE_STATUS');
      if (result[0].type === 'BATCH_UPDATE_STATUS') {
        expect(result[0].updates).toHaveLength(3);
        expect(result[0].updates.every((u) => u.status === 'completed')).toBe(true);
      }

      // Second batch: failed
      expect(result[1].type).toBe('BATCH_UPDATE_STATUS');
      if (result[1].type === 'BATCH_UPDATE_STATUS') {
        expect(result[1].updates).toHaveLength(2);
        expect(result[1].updates.every((u) => u.status === 'failed')).toBe(true);
      }
    });

    it('preserves already-batched BATCH_UPDATE_STATUS', () => {
      const decisions: Decision[] = [
        {
          type: 'BATCH_UPDATE_STATUS',
          updates: [
            { tokenId: 'tok-1', status: 'completed' },
            { tokenId: 'tok-2', status: 'completed' },
          ],
        },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('BATCH_UPDATE_STATUS');
    });
  });

  describe('mixed decisions and order preservation', () => {
    it('flushes creates before accumulating updates', () => {
      const decisions: Decision[] = [
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'A' }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'B' }) },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'completed' },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('BATCH_CREATE_TOKENS');
      expect(result[1].type).toBe('BATCH_UPDATE_STATUS');
    });

    it('flushes updates before accumulating creates', () => {
      const decisions: Decision[] = [
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'completed' },
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'A' }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'B' }) },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('BATCH_UPDATE_STATUS');
      expect(result[1].type).toBe('BATCH_CREATE_TOKENS');
    });

    it('non-batchable decision flushes pending batches', () => {
      const decisions: Decision[] = [
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'A' }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'B' }) },
        { type: 'COMPLETE_WORKFLOW', output: { done: true } },
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'C' }) },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('BATCH_CREATE_TOKENS'); // A + B
      expect(result[1].type).toBe('COMPLETE_WORKFLOW');
      expect(result[2].type).toBe('CREATE_TOKEN'); // C alone
    });

    it('preserves relative order with interleaved non-batchable', () => {
      const decisions: Decision[] = [
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'A' }) },
        { type: 'SET_CONTEXT', path: 'state.x', value: 1 },
        { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'B' }) },
        { type: 'SET_CONTEXT', path: 'state.y', value: 2 },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(5);
      expect(result[0].type).toBe('CREATE_TOKEN'); // A (flushed by SET_CONTEXT)
      expect(result[1].type).toBe('SET_CONTEXT');
      expect(result[2].type).toBe('CREATE_TOKEN'); // B (flushed by SET_CONTEXT)
      expect(result[3].type).toBe('SET_CONTEXT');
      expect(result[4].type).toBe('UPDATE_TOKEN_STATUS'); // tok-1
    });

    it('handles complex real-world sequence', () => {
      // Simulate fan-out: create 3 tokens, then mark them all dispatched
      const decisions: Decision[] = [
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 0 }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 1 }) },
        { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 2 }) },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-0', status: 'dispatched' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'dispatched' },
        { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'dispatched' },
      ];

      const result = batchDecisions(decisions);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('BATCH_CREATE_TOKENS');
      expect(result[1].type).toBe('BATCH_UPDATE_STATUS');

      if (result[0].type === 'BATCH_CREATE_TOKENS') {
        expect(result[0].allParams).toHaveLength(3);
      }
      if (result[1].type === 'BATCH_UPDATE_STATUS') {
        expect(result[1].updates).toHaveLength(3);
      }
    });
  });
});

// ============================================================================
// countBatchedDecisions Tests
// ============================================================================

describe('countBatchedDecisions', () => {
  it('returns zeros for empty input', () => {
    const result = countBatchedDecisions([]);

    expect(result).toEqual({
      original: 0,
      batched: 0,
      reduction: 0,
    });
  });

  it('shows no reduction for non-batchable decisions', () => {
    const decisions: Decision[] = [
      { type: 'SET_CONTEXT', path: 'state.a', value: 1 },
      { type: 'SET_CONTEXT', path: 'state.b', value: 2 },
      { type: 'COMPLETE_WORKFLOW', output: {} },
    ];

    const result = countBatchedDecisions(decisions);

    expect(result).toEqual({
      original: 3,
      batched: 3,
      reduction: 0,
    });
  });

  it('shows reduction for batchable CREATE_TOKEN', () => {
    const decisions: Decision[] = [
      { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 0 }) },
      { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 1 }) },
      { type: 'CREATE_TOKEN', params: createTokenParams({ branch_index: 2 }) },
    ];

    const result = countBatchedDecisions(decisions);

    expect(result).toEqual({
      original: 3,
      batched: 1,
      reduction: 2,
    });
  });

  it('shows reduction for batchable UPDATE_TOKEN_STATUS', () => {
    const decisions: Decision[] = [
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'completed' },
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-3', status: 'completed' },
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-4', status: 'completed' },
    ];

    const result = countBatchedDecisions(decisions);

    expect(result).toEqual({
      original: 4,
      batched: 1,
      reduction: 3,
    });
  });
});

// ============================================================================
// isBatchable Tests
// ============================================================================

describe('isBatchable', () => {
  it('returns true for CREATE_TOKEN', () => {
    const decision: Decision = { type: 'CREATE_TOKEN', params: createTokenParams() };
    expect(isBatchable(decision)).toBe(true);
  });

  it('returns true for UPDATE_TOKEN_STATUS', () => {
    const decision: Decision = {
      type: 'UPDATE_TOKEN_STATUS',
      tokenId: 'tok-1',
      status: 'completed',
    };
    expect(isBatchable(decision)).toBe(true);
  });

  it('returns false for BATCH_CREATE_TOKENS (already batched)', () => {
    const decision: Decision = { type: 'BATCH_CREATE_TOKENS', allParams: [] };
    expect(isBatchable(decision)).toBe(false);
  });

  it('returns false for BATCH_UPDATE_STATUS (already batched)', () => {
    const decision: Decision = { type: 'BATCH_UPDATE_STATUS', updates: [] };
    expect(isBatchable(decision)).toBe(false);
  });

  it('returns false for SET_CONTEXT', () => {
    const decision: Decision = { type: 'SET_CONTEXT', path: 'state.x', value: 1 };
    expect(isBatchable(decision)).toBe(false);
  });

  it('returns false for COMPLETE_WORKFLOW', () => {
    const decision: Decision = { type: 'COMPLETE_WORKFLOW', output: {} };
    expect(isBatchable(decision)).toBe(false);
  });

  it('returns false for FAIL_WORKFLOW', () => {
    const decision: Decision = { type: 'FAIL_WORKFLOW', error: 'error' };
    expect(isBatchable(decision)).toBe(false);
  });
});

// ============================================================================
// extractAffectedTokenIds Tests
// ============================================================================

describe('extractAffectedTokenIds', () => {
  it('returns empty array for empty input', () => {
    expect(extractAffectedTokenIds([])).toEqual([]);
  });

  it('extracts tokenId from UPDATE_TOKEN_STATUS', () => {
    const decisions: Decision[] = [
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
    ];

    expect(extractAffectedTokenIds(decisions)).toEqual(['tok-1']);
  });

  it('extracts tokenId from MARK_WAITING', () => {
    const decisions: Decision[] = [
      { type: 'MARK_WAITING', tokenId: 'tok-2', arrivedAt: new Date() },
    ];

    expect(extractAffectedTokenIds(decisions)).toEqual(['tok-2']);
  });

  it('extracts tokenId from MARK_FOR_DISPATCH', () => {
    const decisions: Decision[] = [{ type: 'MARK_FOR_DISPATCH', tokenId: 'tok-3' }];

    expect(extractAffectedTokenIds(decisions)).toEqual(['tok-3']);
  });

  it('extracts tokenId from CHECK_SYNCHRONIZATION', () => {
    const decisions: Decision[] = [
      {
        type: 'CHECK_SYNCHRONIZATION',
        tokenId: 'tok-4',
        transition: {
          id: 'trans-1',
          fromNodeId: 'A',
          toNodeId: 'B',
          priority: 1,
          condition: null,
          spawnCount: null,
          synchronization: null,
        },
      },
    ];

    expect(extractAffectedTokenIds(decisions)).toEqual(['tok-4']);
  });

  it('extracts tokenId from INIT_BRANCH_TABLE', () => {
    const decisions: Decision[] = [
      { type: 'INIT_BRANCH_TABLE', tokenId: 'tok-5', outputSchema: {} },
    ];

    expect(extractAffectedTokenIds(decisions)).toEqual(['tok-5']);
  });

  it('extracts tokenId from APPLY_BRANCH_OUTPUT', () => {
    const decisions: Decision[] = [
      { type: 'APPLY_BRANCH_OUTPUT', tokenId: 'tok-6', output: { data: 'test' } },
    ];

    expect(extractAffectedTokenIds(decisions)).toEqual(['tok-6']);
  });

  it('extracts tokenIds from BATCH_UPDATE_STATUS', () => {
    const decisions: Decision[] = [
      {
        type: 'BATCH_UPDATE_STATUS',
        updates: [
          { tokenId: 'tok-a', status: 'completed' },
          { tokenId: 'tok-b', status: 'completed' },
          { tokenId: 'tok-c', status: 'completed' },
        ],
      },
    ];

    expect(extractAffectedTokenIds(decisions).sort()).toEqual(['tok-a', 'tok-b', 'tok-c']);
  });

  it('extracts tokenIds from MERGE_BRANCHES', () => {
    const decisions: Decision[] = [
      {
        type: 'MERGE_BRANCHES',
        tokenIds: ['tok-1', 'tok-2', 'tok-3'],
        branchIndices: [0, 1, 2],
        outputSchema: {},
        merge: { strategy: 'append', source: '_branch.output', target: 'state.merged' },
      },
    ];

    expect(extractAffectedTokenIds(decisions).sort()).toEqual(['tok-1', 'tok-2', 'tok-3']);
  });

  it('extracts tokenIds from DROP_BRANCH_TABLES', () => {
    const decisions: Decision[] = [{ type: 'DROP_BRANCH_TABLES', tokenIds: ['tok-x', 'tok-y'] }];

    expect(extractAffectedTokenIds(decisions).sort()).toEqual(['tok-x', 'tok-y']);
  });

  it('extracts mergedTokenIds from ACTIVATE_FAN_IN', () => {
    const decisions: Decision[] = [
      {
        type: 'ACTIVATE_FAN_IN',
        workflowRunId: 'run-1',
        nodeId: 'collect',
        fanInPath: 'root.A.0',
        mergedTokenIds: ['tok-m1', 'tok-m2'],
      },
    ];

    expect(extractAffectedTokenIds(decisions).sort()).toEqual(['tok-m1', 'tok-m2']);
  });

  it('does NOT extract from CREATE_TOKEN (ID not yet known)', () => {
    const decisions: Decision[] = [{ type: 'CREATE_TOKEN', params: createTokenParams() }];

    expect(extractAffectedTokenIds(decisions)).toEqual([]);
  });

  it('does NOT extract from BATCH_CREATE_TOKENS (IDs not yet known)', () => {
    const decisions: Decision[] = [
      {
        type: 'BATCH_CREATE_TOKENS',
        allParams: [createTokenParams(), createTokenParams()],
      },
    ];

    expect(extractAffectedTokenIds(decisions)).toEqual([]);
  });

  it('does NOT extract from context/workflow decisions', () => {
    const decisions: Decision[] = [
      { type: 'SET_CONTEXT', path: 'state.x', value: 1 },
      { type: 'APPLY_OUTPUT', path: 'A', output: {} },
      { type: 'COMPLETE_WORKFLOW', output: {} },
      { type: 'FAIL_WORKFLOW', error: 'error' },
    ];

    expect(extractAffectedTokenIds(decisions)).toEqual([]);
  });

  it('deduplicates token IDs across decisions', () => {
    const decisions: Decision[] = [
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
      { type: 'MARK_FOR_DISPATCH', tokenId: 'tok-1' }, // same ID
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'completed' },
    ];

    expect(extractAffectedTokenIds(decisions).sort()).toEqual(['tok-1', 'tok-2']);
  });

  it('handles complex mixed decisions', () => {
    const decisions: Decision[] = [
      { type: 'CREATE_TOKEN', params: createTokenParams() }, // No ID
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'dispatched' },
      { type: 'SET_CONTEXT', path: 'state.x', value: 1 }, // No ID
      {
        type: 'BATCH_UPDATE_STATUS',
        updates: [
          { tokenId: 'tok-2', status: 'completed' },
          { tokenId: 'tok-3', status: 'completed' },
        ],
      },
      { type: 'MARK_WAITING', tokenId: 'tok-1', arrivedAt: new Date() }, // Duplicate
      { type: 'COMPLETE_WORKFLOW', output: {} }, // No ID
    ];

    expect(extractAffectedTokenIds(decisions).sort()).toEqual(['tok-1', 'tok-2', 'tok-3']);
  });
});

// ============================================================================
// groupByType Tests
// ============================================================================

describe('groupByType', () => {
  it('returns empty map for empty input', () => {
    const result = groupByType([]);
    expect(result.size).toBe(0);
  });

  it('groups single decision type', () => {
    const decisions: Decision[] = [
      { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'A' }) },
      { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'B' }) },
      { type: 'CREATE_TOKEN', params: createTokenParams({ node_id: 'C' }) },
    ];

    const result = groupByType(decisions);

    expect(result.size).toBe(1);
    expect(result.get('CREATE_TOKEN')?.length).toBe(3);
  });

  it('groups multiple decision types', () => {
    const decisions: Decision[] = [
      { type: 'CREATE_TOKEN', params: createTokenParams() },
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-1', status: 'completed' },
      { type: 'CREATE_TOKEN', params: createTokenParams() },
      { type: 'SET_CONTEXT', path: 'state.x', value: 1 },
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 'tok-2', status: 'completed' },
    ];

    const result = groupByType(decisions);

    expect(result.size).toBe(3);
    expect(result.get('CREATE_TOKEN')?.length).toBe(2);
    expect(result.get('UPDATE_TOKEN_STATUS')?.length).toBe(2);
    expect(result.get('SET_CONTEXT')?.length).toBe(1);
  });

  it('preserves decision objects in groups', () => {
    const createDecision: Decision = {
      type: 'CREATE_TOKEN',
      params: createTokenParams({ node_id: 'test' }),
    };
    const decisions: Decision[] = [createDecision];

    const result = groupByType(decisions);
    const creates = result.get('CREATE_TOKEN');

    expect(creates).toHaveLength(1);
    expect(creates?.[0]).toBe(createDecision); // Same reference
  });

  it('handles all decision types', () => {
    const decisions: Decision[] = [
      { type: 'CREATE_TOKEN', params: createTokenParams() },
      { type: 'UPDATE_TOKEN_STATUS', tokenId: 't', status: 'completed' },
      { type: 'BATCH_CREATE_TOKENS', allParams: [] },
      { type: 'BATCH_UPDATE_STATUS', updates: [] },
      { type: 'SET_CONTEXT', path: 'state.k', value: 'v' },
      { type: 'APPLY_OUTPUT', path: 'n', output: {} },
      { type: 'COMPLETE_WORKFLOW', output: {} },
      { type: 'FAIL_WORKFLOW', error: 'e' },
      { type: 'MARK_WAITING', tokenId: 't', arrivedAt: new Date() },
      { type: 'MARK_FOR_DISPATCH', tokenId: 't' },
    ];

    const result = groupByType(decisions);

    expect(result.size).toBe(10);
    for (const [type, group] of result) {
      expect(group.length).toBe(1);
      expect(group[0].type).toBe(type);
    }
  });
});
