/**
 * Unit tests for synchronization decision logic (pure)
 *
 * Tests planning/synchronization.ts decide() function
 * Input: { token, transition, siblings, workflow }
 * Output: Decision[] (UPDATE_TOKEN_STATUS for wait | ACTIVATE_FAN_IN_TOKEN + optional SET_CONTEXT)
 */

import { describe, expect, test } from 'vitest';
import type { WorkflowDefRow } from '../../../src/operations/defs';
import type { TokenRow } from '../../../src/operations/tokens';
import type { Decision, TransitionDef } from '../../../src/types';

// Function under test (to be implemented)
declare function decide(params: {
  token: TokenRow;
  transition: TransitionDef;
  siblings: TokenRow[];
  workflow: WorkflowDefRow;
}): Decision[];

describe('synchronization.decide()', () => {
  const workflow: WorkflowDefRow = {
    id: 'wf_1',
    name: 'Test Workflow',
    description: 'Test description',
    version: 1,
    project_id: null,
    library_id: null,
    tags: null,
    input_schema: {},
    output_schema: {},
    output_mapping: null,
    context_schema: null,
    initial_node_id: null,
    created_at: '2025-12-14T10:00:00Z',
    updated_at: '2025-12-14T10:00:00Z',
  };

  const baseToken: TokenRow = {
    id: 'tok_collect_1',
    workflow_run_id: 'run_1',
    node_id: 'node_collect',
    parent_token_id: 'tok_q1',
    path_id: 'root.question.0',
    fan_out_transition_id: 'start_to_question',
    branch_index: 0,
    branch_total: 3,
    status: 'pending',
    created_at: new Date('2025-12-14T10:00:00Z'),
    updated_at: new Date('2025-12-14T10:00:00Z'),
    arrived_at: null,
  };

  describe('no synchronization configured', () => {
    test('returns empty decisions (routing handles dispatch)', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        from_node_id: 'node_question',
        to_node_id: 'node_collect',
        priority: 1,
        condition: null,
        spawn_count: null,
        synchronization: null,
      };

      const decisions = decide({
        token: baseToken,
        transition,
        siblings: [],
        workflow,
      });

      // No synchronization = routing already marked for dispatch
      expect(decisions).toEqual([]);
    });
  });

  describe('sibling group filtering', () => {
    test('returns empty if token not in specified sibling group', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        from_node_id: 'node_question',
        to_node_id: 'node_collect',
        priority: 1,
        condition: null,
        spawn_count: null,
        synchronization: {
          strategy: 'all',
          sibling_group: 'different_transition', // baseToken.fan_out_transition_id = 'start_to_question'
          timeout_ms: null,
          on_timeout: 'fail',
          merge: undefined,
        },
      };

      const decisions = decide({
        token: baseToken,
        transition,
        siblings: [],
        workflow,
      });

      // Token not in sibling group, no synchronization needed
      expect(decisions).toEqual([]);
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
          sibling_group: 'start_to_question', // Matches baseToken.fan_out_transition_id
          timeout_ms: null,
          on_timeout: 'fail',
          merge: undefined,
        },
      };

      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'pending' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      // Should return decision (wait or activate)
      expect(decisions.length).toBeGreaterThan(0);
    });
  });

  describe('strategy: all', () => {
    const transition: TransitionDef = {
      id: 'trans_1',
      from_node_id: 'node_question',
      to_node_id: 'node_collect',
      priority: 1,
      condition: null,
      spawn_count: null,
      synchronization: {
        strategy: 'all',
        sibling_group: 'start_to_question',
        timeout_ms: null,
        on_timeout: 'fail',
        merge: undefined,
      },
    };

    test('waits when not all siblings completed', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'executing' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'UPDATE_TOKEN_STATUS',
          tokenId: 'tok_collect_1',
          status: 'waiting_for_siblings',
        }),
      );
    });

    test('activates when all siblings in terminal states', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'completed' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'ACTIVATE_FAN_IN_TOKEN',
          nodeId: 'node_collect',
        }),
      );
    });

    test('includes failed siblings in terminal count', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'failed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'completed' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      // All terminal = activate
      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'ACTIVATE_FAN_IN_TOKEN',
        }),
      );
    });
  });

  describe('strategy: any', () => {
    const transition: TransitionDef = {
      id: 'trans_1',
      from_node_id: 'node_question',
      to_node_id: 'node_collect',
      priority: 1,
      condition: null,
      spawn_count: null,
      synchronization: {
        strategy: 'any',
        sibling_group: 'start_to_question',
        timeout_ms: null,
        on_timeout: 'fail',
        merge: undefined,
      },
    };

    test('activates immediately on first completion', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'executing' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'pending' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'ACTIVATE_FAN_IN_TOKEN',
        }),
      );
    });

    test('waits if no siblings completed yet', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'executing' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'executing' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'pending' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'UPDATE_TOKEN_STATUS',
          status: 'waiting_for_siblings',
        }),
      );
    });
  });

  describe('strategy: m_of_n', () => {
    const transition: TransitionDef = {
      id: 'trans_1',
      from_node_id: 'node_question',
      to_node_id: 'node_collect',
      priority: 1,
      condition: null,
      spawn_count: null,
      synchronization: {
        strategy: { m_of_n: 3 },
        sibling_group: 'start_to_question',
        timeout_ms: null,
        on_timeout: 'fail',
        merge: undefined,
      },
    };

    test('waits when fewer than M siblings completed', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'executing' },
        { ...baseToken, id: 'tok_q4', node_id: 'node_question', status: 'pending' },
        { ...baseToken, id: 'tok_q5', node_id: 'node_question', status: 'pending' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'UPDATE_TOKEN_STATUS',
          status: 'waiting_for_siblings',
        }),
      );
    });

    test('activates when M siblings completed', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q4', node_id: 'node_question', status: 'executing' },
        { ...baseToken, id: 'tok_q5', node_id: 'node_question', status: 'pending' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'ACTIVATE_FAN_IN_TOKEN',
        }),
      );
    });

    test('counts failed siblings toward M', () => {
      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'failed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q4', node_id: 'node_question', status: 'executing' },
        { ...baseToken, id: 'tok_q5', node_id: 'node_question', status: 'pending' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      // 3 terminal (2 completed + 1 failed) = activate
      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'ACTIVATE_FAN_IN_TOKEN',
        }),
      );
    });
  });

  describe('merge configuration', () => {
    test('includes SET_CONTEXT decision when merge specified', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        from_node_id: 'node_question',
        to_node_id: 'node_collect',
        priority: 1,
        condition: null,
        spawn_count: null,
        synchronization: {
          strategy: 'all',
          sibling_group: 'start_to_question',
          timeout_ms: null,
          on_timeout: 'fail',
          merge: {
            source: '_branch.output',
            target: 'state.all_answers',
            strategy: 'append',
          },
        },
      };

      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'completed' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      expect(decisions).toContainEqual(
        expect.objectContaining({
          type: 'SET_CONTEXT',
          path: 'state.all_answers',
          // value will be merged outputs
        }),
      );
    });

    test('skips SET_CONTEXT when merge is null', () => {
      const transition: TransitionDef = {
        id: 'trans_1',
        from_node_id: 'node_question',
        to_node_id: 'node_collect',
        priority: 1,
        condition: null,
        spawn_count: null,
        synchronization: {
          strategy: 'all',
          sibling_group: 'start_to_question',
          timeout_ms: null,
          on_timeout: 'fail',
          merge: undefined,
        },
      };

      const siblings: TokenRow[] = [
        { ...baseToken, id: 'tok_q1', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q2', node_id: 'node_question', status: 'completed' },
        { ...baseToken, id: 'tok_q3', node_id: 'node_question', status: 'completed' },
      ];

      const decisions = decide({
        token: baseToken,
        transition,
        siblings,
        workflow,
      });

      const setContextDecisions = decisions.filter((d) => d.type === 'SET_CONTEXT');
      expect(setContextDecisions).toHaveLength(0);
    });
  });
});
