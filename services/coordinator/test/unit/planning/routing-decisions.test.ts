/**
 * Tests for decideRouting
 *
 * Pure unit tests for routing decision logic.
 * Tests priority tiers, condition evaluation, spawn counts, and path building.
 */

import { parse } from '@wonder/expressions';
import { describe, expect, test } from 'vitest';

import type { TransitionRow } from '../../../src/operations/defs';
import type { TokenRow } from '../../../src/operations/tokens';
import { decideRouting } from '../../../src/planning/routing';
import type { Condition, ContextSnapshot } from '../../../src/types';

// Helper to create condition from expression string
function cond(expr: string): Condition {
  return parse(expr);
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createToken(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    id: 'tok_completed',
    workflowRunId: 'wfr_123',
    nodeId: 'nodeA',
    parentTokenId: null,
    pathId: 'root',
    siblingGroup: null,
    branchIndex: 0,
    branchTotal: 1,
    iterationCounts: null,
    status: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
    arrivedAt: null,
    ...overrides,
  };
}

function createTransition(overrides: Partial<TransitionRow> = {}): TransitionRow {
  return {
    id: 'trans_1',
    ref: 'trans_1',
    workflow_def_id: 'wfd_123',
    workflow_def_version: 1,
    fromNodeId: 'nodeA',
    toNodeId: 'nodeB',
    priority: 1,
    condition: null,
    spawnCount: null,
    siblingGroup: null,
    foreach: null,
    synchronization: null,
    loopConfig: null,
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
        workflowRunId: 'wfr_123',
        nodeId: 'nodeB',
        parentTokenId: 'tok_completed',
      },
    });
  });
});

// ============================================================================
// Conditional Routing
// ============================================================================

describe('decideRouting - conditional', () => {
  test('matching condition creates token', () => {
    const condition = cond('state.score >= 80');

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
    const condition = cond('state.score >= 90');

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
        toNodeId: 'nodeB',
        condition: cond('state.status === "approved"'),
      }),
      createTransition({
        id: 'trans_p2',
        priority: 2,
        toNodeId: 'nodeC',
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
      params: { nodeId: 'nodeB' },
    });
  });

  test('fallback to lower priority when higher fails', () => {
    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_p1',
        priority: 1,
        toNodeId: 'nodeB',
        condition: cond('state.status === "rejected"'),
      }),
      createTransition({
        id: 'trans_p2',
        priority: 2,
        toNodeId: 'nodeC',
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
      params: { nodeId: 'nodeC' },
    });
  });

  test('same priority = parallel dispatch (all matches in tier)', () => {
    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_1',
        priority: 1,
        toNodeId: 'nodeB',
        condition: cond('state.score >= 80'),
      }),
      createTransition({
        id: 'trans_2',
        priority: 1,
        toNodeId: 'nodeC',
        condition: cond('state.status === "approved"'),
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
      result.decisions.map((d) => (d as { params: { nodeId: string } }).params.nodeId),
    ).toEqual(['nodeB', 'nodeC']);
  });

  test('partial match in tier only creates matching tokens', () => {
    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_1',
        priority: 1,
        toNodeId: 'nodeB',
        condition: cond('state.score >= 80'),
      }),
      createTransition({
        id: 'trans_2',
        priority: 1,
        toNodeId: 'nodeC',
        condition: cond('state.score >= 90'),
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
      params: { nodeId: 'nodeB' },
    });
  });
});

// ============================================================================
// Spawn Count (Static Fan-out)
// ============================================================================

describe('decideRouting - spawnCount', () => {
  test('spawnCount=1 (default) creates single token', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ spawnCount: 1 })],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
  });

  test('spawnCount=3 creates three tokens with correct paths', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'trans_fanout', spawnCount: 3, siblingGroup: 'fanout-group' }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(3);

    // Verify path IDs and branch indices
    const params = result.decisions.map((d) => (d as { params: Record<string, unknown> }).params);
    expect(params[0]).toMatchObject({
      pathId: 'root.nodeA.0',
      branchIndex: 0,
      branchTotal: 3,
      siblingGroup: 'fanout-group',
    });
    expect(params[1]).toMatchObject({
      pathId: 'root.nodeA.1',
      branchIndex: 1,
      branchTotal: 3,
      siblingGroup: 'fanout-group',
    });
    expect(params[2]).toMatchObject({
      pathId: 'root.nodeA.2',
      branchIndex: 2,
      branchTotal: 3,
      siblingGroup: 'fanout-group',
    });
  });

  test('spawnCount=5 creates five siblings', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'trans_judges', spawnCount: 5, siblingGroup: 'judges-group' }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(5);

    // All share same siblingGroup
    const siblingGroups = result.decisions.map(
      (d) => (d as { params: { siblingGroup: string } }).params.siblingGroup,
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

describe('decideRouting - siblingGroup inheritance', () => {
  test('single token inherits parent siblingGroup', () => {
    const completedToken = createToken({
      siblingGroup: 'parent_group',
      branchIndex: 2,
      branchTotal: 5,
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ spawnCount: 1 })], // No new fan-out
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: {
        siblingGroup: 'parent_group', // Inherited
        branchTotal: 5, // Inherited
      },
    });
  });

  test('new fan-out creates new siblingGroup', () => {
    const completedToken = createToken({
      siblingGroup: 'parent_group',
      branchIndex: 2,
      branchTotal: 5,
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'new_fanout', spawnCount: 3, siblingGroup: 'new_group' }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(3);

    // All new tokens get the new siblingGroup
    for (const d of result.decisions) {
      expect((d as { params: { siblingGroup: string } }).params.siblingGroup).toBe('new_group');
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
      payload: {
        tokenId: 'tok_completed',
        nodeId: 'nodeA',
      },
    });
  });

  test('emits transition evaluation events', () => {
    const result = decideRouting({
      completedToken: createToken(),
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({ id: 'trans_1' }),
        createTransition({ id: 'trans_2', toNodeId: 'nodeC' }),
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
      transitions: [createTransition({ spawnCount: 3, siblingGroup: 'test-group' })],
      context: baseContext,
    });

    const matchEvent = result.events.find((e) => e.type === 'decision.routing.transition_matched');
    expect(matchEvent).toMatchObject({
      type: 'decision.routing.transition_matched',
      payload: {
        spawnCount: 3,
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

// ============================================================================
// Loop Iteration Limits (loopConfig.max_iterations)
// ============================================================================

describe('decideRouting - loopConfig.max_iterations', () => {
  test('transition fires when iteration count is below max', () => {
    const completedToken = createToken({
      iterationCounts: { trans_loop: 1 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_loop',
          loopConfig: { maxIterations: 3 },
        }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].type).toBe('CREATE_TOKEN');
  });

  test('transition is skipped when iteration count equals max', () => {
    const completedToken = createToken({
      iterationCounts: { trans_loop: 3 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_loop',
          loopConfig: { maxIterations: 3 },
        }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(0);
  });

  test('transition is skipped when iteration count exceeds max', () => {
    const completedToken = createToken({
      iterationCounts: { trans_loop: 5 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_loop',
          loopConfig: { maxIterations: 3 },
        }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(0);
  });

  test('emits loop_limit_reached event when max exceeded', () => {
    const completedToken = createToken({
      iterationCounts: { trans_loop: 3 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_loop',
          loopConfig: { maxIterations: 3 },
        }),
      ],
      context: baseContext,
    });

    const limitEvent = result.events.find((e) => e.type === 'decision.routing.loop_limit_reached');
    expect(limitEvent).toMatchObject({
      type: 'decision.routing.loop_limit_reached',
      payload: {
        transitionId: 'trans_loop',
        currentCount: 3,
        maxIterations: 3,
      },
    });
  });

  test('fallback transition fires when loop limit reached', () => {
    const completedToken = createToken({
      iterationCounts: { trans_loop: 3 },
    });

    const transitions: TransitionRow[] = [
      createTransition({
        id: 'trans_loop',
        priority: 1,
        toNodeId: 'loopNode',
        loopConfig: { maxIterations: 3 },
      }),
      createTransition({
        id: 'trans_exit',
        priority: 2,
        toNodeId: 'exitNode',
      }),
    ];

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions,
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      type: 'CREATE_TOKEN',
      params: { nodeId: 'exitNode' },
    });
  });

  test('loop transition with null iterationCounts starts at 0', () => {
    const completedToken = createToken({
      iterationCounts: null,
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_loop',
          loopConfig: { maxIterations: 3 },
        }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].type).toBe('CREATE_TOKEN');
  });

  test('loop transition with undefined key starts at 0', () => {
    const completedToken = createToken({
      iterationCounts: { other_transition: 5 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_loop',
          loopConfig: { maxIterations: 3 },
        }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
  });
});

// ============================================================================
// Iteration Counts Propagation
// ============================================================================

describe('decideRouting - iterationCounts propagation', () => {
  test('child token inherits parent iterationCounts with increment', () => {
    const completedToken = createToken({
      iterationCounts: { trans_prev: 2 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ id: 'trans_1' })],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(1);
    const params = (result.decisions[0] as { params: { iterationCounts: Record<string, number> } })
      .params;
    expect(params.iterationCounts).toEqual({
      trans_prev: 2, // Inherited
      trans_1: 1, // Incremented for this transition
    });
  });

  test('first traversal of transition sets count to 1', () => {
    const completedToken = createToken({
      iterationCounts: null,
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ id: 'trans_1' })],
      context: baseContext,
    });

    const params = (result.decisions[0] as { params: { iterationCounts: Record<string, number> } })
      .params;
    expect(params.iterationCounts).toEqual({
      trans_1: 1,
    });
  });

  test('repeat traversal increments existing count', () => {
    const completedToken = createToken({
      iterationCounts: { trans_1: 2 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [createTransition({ id: 'trans_1' })],
      context: baseContext,
    });

    const params = (result.decisions[0] as { params: { iterationCounts: Record<string, number> } })
      .params;
    expect(params.iterationCounts).toEqual({
      trans_1: 3,
    });
  });

  test('fan-out tokens all get same iterationCounts', () => {
    const completedToken = createToken({
      iterationCounts: { trans_prev: 1 },
    });

    const result = decideRouting({
      completedToken,
      workflowRunId: 'wfr_123',
      nodeId: 'nodeA',
      transitions: [
        createTransition({
          id: 'trans_fanout',
          spawnCount: 3,
          siblingGroup: 'fanout-group',
        }),
      ],
      context: baseContext,
    });

    expect(result.decisions).toHaveLength(3);
    const expectedCounts = { trans_prev: 1, trans_fanout: 1 };
    for (const decision of result.decisions) {
      const params = (decision as { params: { iterationCounts: Record<string, number> } }).params;
      expect(params.iterationCounts).toEqual(expectedCounts);
    }
  });
});
