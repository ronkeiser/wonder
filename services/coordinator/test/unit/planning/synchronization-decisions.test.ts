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
    workflow_run_id: 'run_1',
    node_id: 'node_collect',
    parent_token_id: 'tok_q1',
    path_id: 'root.question.0',
    sibling_group: 'fanout_group', // Token's sibling group membership
    branch_index: 0,
    branch_total: 3,
    status: 'pending',
    created_at: new Date('2025-12-14T10:00:00Z'),
    updated_at: new Date('2025-12-14T10:00:00Z'),
    arrived_at: null,
  };

  describe('no synchronization configured', () => {
    test('returns MARK_FOR_DISPATCH (routing handles dispatch)', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        from_node_id: 'node_question',
        to_node_id: 'node_collect',
        priority: 1,
        condition: null,
        spawn_count: null,
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
        from_node_id: 'node_question',
        to_node_id: 'node_collect',
        priority: 1,
        condition: null,
        spawn_count: null,
        synchronization: {
          strategy: 'all',
          sibling_group: 'different_group', // baseToken.sibling_group = 'fanout_group'
          timeout_ms: null,
          on_timeout: 'fail',
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
        from_node_id: 'node_question',
        to_node_id: 'node_collect',
        priority: 1,
        condition: null,
        spawn_count: null,
        synchronization: {
          strategy: 'all',
          sibling_group: 'fanout_group', // Matches baseToken.sibling_group
          timeout_ms: null,
          on_timeout: 'fail',
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
      from_node_id: 'node_question',
      to_node_id: 'node_collect',
      priority: 1,
      condition: null,
      spawn_count: null,
      synchronization: {
        strategy: 'all',
        sibling_group: 'fanout_group', // Matches baseToken.sibling_group
        timeout_ms: null,
        on_timeout: 'fail',
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
      from_node_id: 'node_question',
      to_node_id: 'node_collect',
      priority: 1,
      condition: null,
      spawn_count: null,
      synchronization: {
        strategy: 'any',
        sibling_group: 'fanout_group', // Matches baseToken.sibling_group
        timeout_ms: null,
        on_timeout: 'fail',
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

  describe('strategy: m_of_n', () => {
    const makeTransition = (m: number): TransitionDef => ({
      id: 'trans_1',
      from_node_id: 'node_question',
      to_node_id: 'node_collect',
      priority: 1,
      condition: null,
      spawn_count: null,
      synchronization: {
        strategy: { m_of_n: m },
        sibling_group: 'fanout_group', // Matches baseToken.sibling_group
        timeout_ms: null,
        on_timeout: 'fail',
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
  test('creates continuation token with inherited iteration_counts', () => {
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
        workflow_run_id: 'run_1',
        node_id: 'node_after_merge',
        parent_token_id: 'tok_origin',
        iteration_counts: { trans_loop: 2, trans_other: 1 },
      },
    });
  });

  test('creates continuation token with null iteration_counts when parent has none', () => {
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
        iteration_counts: null,
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
      params: { sibling_group: string | null };
    };
    expect(createTokenDecision.params.sibling_group).toBeNull();
  });

  test('continuation token has branch_index 0 and branch_total 1', () => {
    const result = decideFanInContinuation({
      workflowRunId: 'run_1',
      nodeId: 'node_after_merge',
      fanInPath: 'fanout_group:node_after_merge',
      parentTokenId: 'tok_origin',
    });

    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: {
        branch_index: 0,
        branch_total: 1,
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
      node_id: 'node_after_merge',
      payload: {
        workflow_run_id: 'run_1',
        fan_in_path: 'fanout_group:node_after_merge',
      },
    });
  });
});

