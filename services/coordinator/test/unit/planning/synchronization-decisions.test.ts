/**
 * Unit tests for synchronization decision logic (pure)
 *
 * Tests planning/synchronization.ts decideSynchronization() function
 * which determines fan-in behavior when tokens arrive at sync points.
 */

import { describe, expect, test } from 'vitest';
import type { SiblingCounts, TokenRow } from '../../../src/operations/tokens';
import { decideFanInContinuation, decideSynchronization } from '../../../src/planning/synchronization';
import type { TransitionDef } from '../../../src/types';

describe('decideSynchronization()', () => {
  const baseToken: TokenRow = {
    id: 'tok_collect_1',
    workflowRunId: 'run_1',
    nodeId: 'node_collect',
    parentTokenId: 'tok_q1',
    pathId: 'root.question.0',
    siblingGroup: 'fanout_group', // Token's sibling group membership
    branchIndex: 0,
    branchTotal: 3,
    iterationCounts: null,
    status: 'pending',
    createdAt: new Date('2025-12-14T10:00:00Z'),
    updatedAt: new Date('2025-12-14T10:00:00Z'),
    arrivedAt: null,
  };

  describe('no synchronization configured', () => {
    test('returns MARK_FOR_DISPATCH (routing handles dispatch)', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        fromNodeId: 'node_question',
        toNodeId: 'node_collect',
        priority: 1,
        condition: null,
        spawnCount: null,
        synchronization: null,
      };

      const result = decideSynchronization({
        token: baseToken,
        transition,
        siblingCounts: { total: 0, completed: 0, failed: 0, waiting: 0, terminal: 0 },
        workflowRunId: 'run_1',
      });

      // No synchronization = MARK_FOR_DISPATCH
      expect(result.decisions).toEqual([{ type: 'MARK_FOR_DISPATCH', tokenId: 'tok_collect_1' }]);
    });
  });

  describe('sibling group filtering', () => {
    test('returns MARK_FOR_DISPATCH if token not in specified sibling group', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        fromNodeId: 'node_question',
        toNodeId: 'node_collect',
        priority: 1,
        condition: null,
        spawnCount: null,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'different_group', // baseToken.siblingGroup = 'fanout_group'
          timeoutMs: undefined,
          onTimeout: 'fail',
          merge: undefined,
        },
      };

      const result = decideSynchronization({
        token: baseToken,
        transition,
        siblingCounts: { total: 3, completed: 0, failed: 0, waiting: 0, terminal: 0 },
        workflowRunId: 'run_1',
      });

      // Token not in sibling group, passes through with MARK_FOR_DISPATCH
      expect(result.decisions).toEqual([{ type: 'MARK_FOR_DISPATCH', tokenId: 'tok_collect_1' }]);
    });

    test('evaluates synchronization if token matches sibling group', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        fromNodeId: 'node_question',
        toNodeId: 'node_collect',
        priority: 1,
        condition: null,
        spawnCount: null,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'fanout_group', // Matches baseToken.siblingGroup
          timeoutMs: undefined,
          onTimeout: 'fail',
          merge: undefined,
        },
      };

      // Not all siblings completed yet
      const result = decideSynchronization({
        token: baseToken,
        transition,
        siblingCounts: { total: 3, completed: 2, failed: 0, waiting: 0, terminal: 2 },
        workflowRunId: 'run_1',
      });

      // Should return MARK_WAITING since not all siblings done
      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'MARK_WAITING' }));
    });
  });

  describe('strategy: all', () => {
    const makeTransition = (): TransitionDef => ({
      id: 'trans_1',
      fromNodeId: 'node_question',
      toNodeId: 'node_collect',
      priority: 1,
      condition: null,
      spawnCount: null,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'fanout_group', // Matches baseToken.siblingGroup
        timeoutMs: undefined,
        onTimeout: 'fail',
        merge: undefined,
      },
    });

    test('waits when not all siblings completed', () => {
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(),
        siblingCounts: { total: 3, completed: 2, failed: 0, waiting: 0, terminal: 2 },
        workflowRunId: 'run_1',
      });

      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'MARK_WAITING' }));
    });

    test('activates fan-in when all siblings in terminal states', () => {
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(),
        siblingCounts: { total: 3, completed: 3, failed: 0, waiting: 0, terminal: 3 },
        workflowRunId: 'run_1',
      });

      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN' }));
    });

    test('includes failed siblings in terminal count', () => {
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(),
        siblingCounts: { total: 3, completed: 2, failed: 1, waiting: 0, terminal: 3 },
        workflowRunId: 'run_1',
      });

      // 2 completed + 1 failed = 3 terminal = all done
      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN' }));
    });
  });

  describe('strategy: any', () => {
    const makeTransition = (): TransitionDef => ({
      id: 'trans_1',
      fromNodeId: 'node_question',
      toNodeId: 'node_collect',
      priority: 1,
      condition: null,
      spawnCount: null,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'fanout_group', // Matches baseToken.siblingGroup
        timeoutMs: undefined,
        onTimeout: 'fail',
        merge: undefined,
      },
    });

    test('dispatches immediately on first arrival', () => {
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(),
        siblingCounts: { total: 3, completed: 0, failed: 0, waiting: 0, terminal: 0 },
        workflowRunId: 'run_1',
      });

      // 'any' strategy = dispatch immediately
      expect(result.decisions).toEqual([{ type: 'MARK_FOR_DISPATCH', tokenId: 'tok_collect_1' }]);
    });
  });

  describe('strategy: mOfN', () => {
    const makeTransition = (m: number): TransitionDef => ({
      id: 'trans_1',
      fromNodeId: 'node_question',
      toNodeId: 'node_collect',
      priority: 1,
      condition: null,
      spawnCount: null,
      synchronization: {
        strategy: { mOfN: m },
        siblingGroup: 'fanout_group', // Matches baseToken.siblingGroup
        timeoutMs: undefined,
        onTimeout: 'fail',
        merge: undefined,
      },
    });

    test('waits when fewer than M siblings completed', () => {
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(2),
        siblingCounts: { total: 3, completed: 1, failed: 0, waiting: 0, terminal: 1 },
        workflowRunId: 'run_1',
      });

      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'MARK_WAITING' }));
    });

    test('activates when M siblings completed', () => {
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(2),
        siblingCounts: { total: 3, completed: 2, failed: 0, waiting: 0, terminal: 2 },
        workflowRunId: 'run_1',
      });

      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN' }));
    });

    test('requires M successful completions (not just terminals)', () => {
      // m_of_n counts only completed (successful) tokens, not failed
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(2), // M = 2
        siblingCounts: { total: 3, completed: 1, failed: 1, waiting: 0, terminal: 2 },
        workflowRunId: 'run_1',
      });

      // 1 completed < M=2, so should wait despite 2 terminals
      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'MARK_WAITING' }));
    });

    test('activates when M successful completions reached', () => {
      const result = decideSynchronization({
        token: baseToken,
        transition: makeTransition(2), // M = 2
        siblingCounts: { total: 3, completed: 2, failed: 1, waiting: 0, terminal: 3 },
        workflowRunId: 'run_1',
      });

      // 2 completed >= M=2, activates even with failures
      expect(result.decisions).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN' }));
    });
  });
});

// ============================================================================
// Fan-In Continuation (decideFanInContinuation)
// ============================================================================

describe('decideFanInContinuation()', () => {
  test('creates continuation token with inherited iterationCounts', () => {
    const result = decideFanInContinuation({
      workflowRunId: 'run_1',
      nodeId: 'node_after_merge',
      fanInPath: 'fanout_group:node_after_merge',
      parentTokenId: 'tok_origin',
      parentIterationCounts: { trans_loop: 2, trans_other: 1 },
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: {
        workflowRunId: 'run_1',
        nodeId: 'node_after_merge',
        parentTokenId: 'tok_origin',
        iterationCounts: { trans_loop: 2, trans_other: 1 },
      },
    });
  });

  test('creates continuation token with null iterationCounts when parent has none', () => {
    const result = decideFanInContinuation({
      workflowRunId: 'run_1',
      nodeId: 'node_after_merge',
      fanInPath: 'fanout_group:node_after_merge',
      parentTokenId: 'tok_origin',
      parentIterationCounts: undefined,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: {
        iterationCounts: null,
      },
    });
  });

  test('continuation token is not part of any sibling group', () => {
    const result = decideFanInContinuation({
      workflowRunId: 'run_1',
      nodeId: 'node_after_merge',
      fanInPath: 'fanout_group:node_after_merge',
      parentTokenId: 'tok_origin',
      parentIterationCounts: { trans_loop: 3 },
    });

    const createTokenDecision = result.decisions[0] as {
      type: 'CREATE_TOKEN';
      params: { siblingGroup: string | null };
    };
    expect(createTokenDecision.params.siblingGroup).toBeNull();
  });

  test('continuation token has branchIndex 0 and branchTotal 1', () => {
    const result = decideFanInContinuation({
      workflowRunId: 'run_1',
      nodeId: 'node_after_merge',
      fanInPath: 'fanout_group:node_after_merge',
      parentTokenId: 'tok_origin',
    });

    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: {
        branchIndex: 0,
        branchTotal: 1,
      },
    });
  });

  test('emits continuation event with correct metadata', () => {
    const result = decideFanInContinuation({
      workflowRunId: 'run_1',
      nodeId: 'node_after_merge',
      fanInPath: 'fanout_group:node_after_merge',
      parentTokenId: 'tok_origin',
    });

    expect(result.events).toContainEqual({
      type: 'decision.sync.continuation',
      nodeId: 'node_after_merge',
      payload: {
        workflowRunId: 'run_1',
        fanInPath: 'fanout_group:node_after_merge',
      },
    });
  });
});

