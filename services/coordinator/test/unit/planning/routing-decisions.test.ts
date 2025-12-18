/**
 * Tests for decideRouting
 *
 * Pure unit tests for routing decision logic.
 * Tests priority tiers, condition evaluation, spawn counts, and path building.
 */

import { describe, expect, test } from 'vitest';

import type { TransitionRow } from '../../../src/operations/defs';
import type { TokenRow } from '../../../src/operations/tokens';
import { decideRouting } from '../../../src/planning/routing';
import type { Condition, ContextSnapshot } from '../../../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

function createToken(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    id: 'tok_completed',
    workflow_run_id: 'wfr_123',
    node_id: 'nodeA',
    parent_token_id: null,
    path_id: 'root',
    sibling_group: null,
    branch_index: 0,
    branch_total: 1,
    status: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
    arrived_at: null,
    ...overrides,
  };
}

function createTransition(overrides: Partial<TransitionRow> = {}): TransitionRow {
  return {
    id: 'trans_1',
    ref: 'trans_1',
    workflow_def_id: 'wfd_123',
    workflow_def_version: 1,
    from_node_id: 'nodeA',
    to_node_id: 'nodeB',
    priority: 1,
    condition: null,
    spawn_count: null,
    sibling_group: null,
    foreach: null,
    synchronization: null,
    loop_config: null,
    ...overrides,
  };
}

const baseContext: ContextSnapshot = {
  input: { name: 'test' },
  state: { score: 85, status: 'approved' },
  output: {},
};

// ============================================================================
// No Transitions
// ============================================================================

describe('decideRouting - no transitions', () => {
  test('returns empty decisions when no transitions', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(0);
  });
});

// ============================================================================
// Unconditional Routing
// ============================================================================

describe('decideRouting - unconditional', () => {
  test('single unconditional transition creates one token', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition()],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: {
        workflow_run_id: 'wfr_123',
        node_id: 'nodeB',
        parent_token_id: 'tok_completed',
        path_id: 'root', // No fan-out, path unchanged
        branch_index: 0,
        branch_total: 1,
      },
    });
  });
});

// ============================================================================
// Conditional Routing
// ============================================================================

describe('decideRouting - conditional', () => {
  test('matching condition creates token', () => {
    const condition: Condition = {
      type: 'comparison',
      left: { field: 'state.score' },
      operator: '>=',
      right: { literal: 80 },
    };

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ condition })],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].type).toBe('CREATE_TOKEN');
  });

  test('non-matching condition creates no token', () => {
    const condition: Condition = {
      type: 'comparison',
      left: { field: 'state.score' },
      operator: '>=',
      right: { literal: 90 },
    };

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ condition })],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(0);
  });
});

// ============================================================================
// Priority Tiers
// ============================================================================

describe('decideRouting - priority tiers', () => {
  test('first matching tier wins (priority 1 matches)', () => {
    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_p1',
        priority: 1,
        to_node_id: 'nodeB',
        condition: {
          type: 'comparison',
          left: { field: 'state.status' },
          operator: '==',
          right: { literal: 'approved' },
        },
      }),
      createTransition({
        id: 'trans_p2',
        priority: 2,
        to_node_id: 'nodeC',
        condition: null, // Would match, but priority 1 already matched
      }),
    ];

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions,
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: { node_id: 'nodeB' },
    });
  });

  test('fallback to lower priority when higher fails', () => {
    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_p1',
        priority: 1,
        to_node_id: 'nodeB',
        condition: {
          type: 'comparison',
          left: { field: 'state.status' },
          operator: '==',
          right: { literal: 'rejected' },
        },
      }),
      createTransition({
        id: 'trans_p2',
        priority: 2,
        to_node_id: 'nodeC',
        condition: null, // Fallback
      }),
    ];

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions,
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: { node_id: 'nodeC' },
    });
  });

  test('same priority = parallel dispatch (all matches in tier)', () => {
    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_1',
        priority: 1,
        to_node_id: 'nodeB',
        condition: {
          type: 'comparison',
          left: { field: 'state.score' },
          operator: '>=',
          right: { literal: 80 },
        },
      }),
      createTransition({
        id: 'trans_2',
        priority: 1,
        to_node_id: 'nodeC',
        condition: {
          type: 'comparison',
          left: { field: 'state.status' },
          operator: '==',
          right: { literal: 'approved' },
        },
      }),
    ];

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions,
      context: baseContext,
    });

    // Both match at priority 1 → both fire
    expect(result.decisions).toHaveLength(2);
    expect(
      result.decisions.map((d) => (d as { params: { node_id: string } }).params.node_id),
    ).toEqual(['nodeB', 'nodeC']);
  });

  test('partial match in tier only creates matching tokens', () => {
    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_1',
        priority: 1,
        to_node_id: 'nodeB',
        condition: {
          type: 'comparison',
          left: { field: 'state.score' },
          operator: '>=',
          right: { literal: 80 },
        },
      }),
      createTransition({
        id: 'trans_2',
        priority: 1,
        to_node_id: 'nodeC',
        condition: {
          type: 'comparison',
          left: { field: 'state.score' },
          operator: '>=',
          right: { literal: 90 },
        },
      }),
    ];

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions,
      context: baseContext,
    });

    // score=85: first matches, second doesn't
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: { node_id: 'nodeB' },
    });
  });
});

// ============================================================================
// Spawn Count (Static Fan-out)
// ============================================================================

describe('decideRouting - spawn_count', () => {
  test('spawn_count=1 (default) creates single token', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ spawn_count: 1 })],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
  });

  test('spawn_count=3 creates three tokens with correct paths', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'trans_fanout', spawn_count: 3, sibling_group: 'fanout-group' }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(3);

    // Verify path IDs and branch indices
    const params = result.decisions.map((d) => (d as { params: Record<string, unknown> }).params);
    expect(params[0]).toMatchObject({
      path_id: 'root.nodeA.0',
      branch_index: 0,
      branch_total: 3,
      sibling_group: 'fanout-group',
    });
    expect(params[1]).toMatchObject({
      path_id: 'root.nodeA.1',
      branch_index: 1,
      branch_total: 3,
      sibling_group: 'fanout-group',
    });
    expect(params[2]).toMatchObject({
      path_id: 'root.nodeA.2',
      branch_index: 2,
      branch_total: 3,
      sibling_group: 'fanout-group',
    });
  });

  test('spawn_count=5 creates five siblings', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'trans_judges', spawn_count: 5, sibling_group: 'judges-group' }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(5);

    // All share same sibling_group
    const siblingGroups = result.decisions.map(
      (d) => (d as { params: { sibling_group: string } }).params.sibling_group,
    );
    expect(new Set(siblingGroups).size).toBe(1);
    expect(siblingGroups[0]).toBe('judges-group');
  });
});

// ============================================================================
// Foreach (Dynamic Fan-out)
// ============================================================================

describe('decideRouting - foreach', () => {
  test('foreach iterates over collection', () => {
    const context: ContextSnapshot = {
      input: { items: ['a', 'b', 'c'] },
      state: {},
      output: {},
    };

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_foreach',
          foreach: { collection: 'input.items', item_var: 'item' },
        }),
      ],
      context,
    });

    expect(result.decisions).toHaveLength(3);
  });

  test('foreach with empty array creates no tokens', () => {
    const context: ContextSnapshot = {
      input: { items: [] },
      state: {},
      output: {},
    };

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          foreach: { collection: 'input.items', item_var: 'item' },
        }),
      ],
      context,
    });

    // Empty array → no tokens (nothing to iterate)
    expect(result.decisions).toHaveLength(0);
  });

  test('foreach with missing collection creates one token', () => {
    const context: ContextSnapshot = {
      input: {},
      state: {},
      output: {},
    };

    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          foreach: { collection: 'input.missing', item_var: 'item' },
        }),
      ],
      context,
    });

    expect(result.decisions).toHaveLength(1);
  });
});

// ============================================================================
// Sibling Group Inheritance
// ============================================================================

describe('decideRouting - sibling_group inheritance', () => {
  test('single token inherits parent sibling_group', () => {
    const completedToken = createToken({
      sibling_group: 'parent_group',
      branch_index: 2,
      branch_total: 5,
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ spawn_count: 1 })], // No new fan-out
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: {
        sibling_group: 'parent_group', // Inherited
        branch_total: 5, // Inherited
      },
    });
  });

  test('new fan-out creates new sibling_group', () => {
    const completedToken = createToken({
      sibling_group: 'parent_group',
      branch_index: 2,
      branch_total: 5,
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'new_fanout', spawn_count: 3, sibling_group: 'new_group' }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(3);

    // All new tokens get the new sibling_group
    for (const d of result.decisions) {
      expect((d as { params: { sibling_group: string } }).params.sibling_group).toBe('new_group');
    }
  });
});

// ============================================================================
// Events
// ============================================================================

describe('decideRouting - events', () => {
  test('emits routing start event', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition()],
      context: baseContext,
    });

    const startEvent = result.events.find((e) => e.type === 'decision.routing.start');
    expect(startEvent).toBeDefined();
    expect(startEvent).toMatchObject({
      type: 'decision.routing.start',
      token_id: 'tok_completed',
      node_id: 'nodeA',
    });
  });

  test('emits transition evaluation events', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'trans_1' }),
        createTransition({ id: 'trans_2', to_node_id: 'nodeC' }),
      ],
      context: baseContext,
    });

    const evalEvents = result.events.filter(
      (e) => e.type === 'decision.routing.evaluate_transition',
    );
    expect(evalEvents).toHaveLength(2);
  });

  test('emits transition matched events', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ spawn_count: 3, sibling_group: 'test-group' })],
      context: baseContext,
    });

    const matchEvent = result.events.find((e) => e.type === 'decision.routing.transition_matched');
    expect(matchEvent).toMatchObject({
      type: 'decision.routing.transition_matched',
      payload: {
        spawn_count: 3,
      },
    });
  });

  test('emits routing complete event', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition()],
      context: baseContext,
    });

    const completeEvent = result.events.find((e) => e.type === 'decision.routing.complete');
    expect(completeEvent).toBeDefined();
  });
});
