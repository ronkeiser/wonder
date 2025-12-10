# Testing Strategy

Wonder uses a **3-layer testing strategy** that leverages the Decision Pattern to achieve comprehensive coverage without mocks.

## Three-Layer Testing Strategy

### Layer 1: Unit Tests (Fast - No Infrastructure)

Test pure decision functions with mock data. Runs in milliseconds, no database/DO/RPC.

**Scope:**

- `decisions/routing.ts` - Transition evaluation logic
- `decisions/synchronization.ts` - Fan-in merge logic
- `decisions/completion.ts` - Output extraction
- `decisions/conditions.ts` - Condition evaluation

**Benefits:**

- Exhaustive edge case coverage
- Property-based testing
- Regression tests from production captures
- Fast CI feedback (< 1 second)

### Layer 2: SDK Introspection Tests (Medium - Live Architecture)

Test decision functions with real workflow definitions and context from live infrastructure. Bridges unit tests and E2E.

**Scope:**

- Validate decisions against actual WorkflowDef structures
- Test with real context schemas and values
- Verify condition evaluation with live data
- Debug production issues by replaying state

**Benefits:**

- Realistic workflow structures
- No mocks needed for workflow/context data
- Safe to run against production (read-only)
- Medium speed (hundreds of ms)

### Layer 3: E2E Tests (Primary - Full Stack)

Execute complete workflows with real infrastructure. **This is the primary validation layer** - E2E tests are the ultimate source of truth that the architecture works. Layers 1 and 2 are safety rails for fast iteration.

**Scope:**

- Full workflow execution (edge test: ideation → judging → ranking)
- Real Cloudflare services (DO, D1, Workers AI)
- Template rendering, schema validation, action execution
- Token spawning, synchronization, branch isolation

**Benefits:**

- Definitive proof the system works end-to-end
- Tests the actual production code path
- Validates all integration points together
- Fast enough to run frequently (Miniflare is quick)
- Reference implementation for complex patterns

## Why Testing Without Mocks Works

The Actor/Decision pattern separates pure logic from I/O:

**Decision functions** are pure - they take state as input and return data structures:

```typescript
// decisions/routing.ts
export function decide(context: Context, token: Token, transitions: Transition[]): Decision[] {
  const matches = transitions.filter((t) => evaluateCondition(t.condition, context));

  if (matches.length === 0) {
    return [{ type: 'MARK_COMPLETED', token_id: token.id }];
  }

  return matches.map((t) => ({
    type: 'DISPATCH_TOKEN',
    token_id: token.id,
    transition_id: t.id,
    spawn_count: t.spawn_count ?? 1,
  }));
}
```

This is pure computation - no SQL, no RPC, no side effects. Test with plain objects:

```typescript
test('routing decision with multiple matching transitions', () => {
  const context = { state: { approved: true } };
  const token = { id: 'tok_123', status: 'completed' };
  const transitions = [
    { id: 't1', condition: { field: 'state.approved', equals: true }, spawn_count: 5 },
    { id: 't2', condition: { field: 'state.approved', equals: true }, spawn_count: 3 },
  ];

  const decisions = routing.decide(context, token, transitions);

  expect(decisions).toHaveLength(2);
  expect(decisions[0]).toEqual({
    type: 'DISPATCH_TOKEN',
    token_id: 'tok_123',
    transition_id: 't1',
    spawn_count: 5,
  });
});
```

**No need for mock layers** because:

1. Decision logic tested in isolation (pure functions)
2. Operations are simple primitives (SQL queries, RPC calls) that don't need mocking
3. Integration tests use real infrastructure (Miniflare for local, deployed for CI)
4. No "mock drift" where mocks diverge from real behavior

## Three-Layer Testing Strategy

### Layer 1: Unit Tests (Fast - No Infrastructure)

Test pure decision functions with mock data. Runs in milliseconds, no database/DO/RPC.

**Scope:**

- `decisions/routing.ts` - Transition evaluation logic
- `decisions/synchronization.ts` - Fan-in merge logic
- `decisions/completion.ts` - Output extraction
- `decisions/conditions.ts` - Condition evaluation

**Benefits:**

- Exhaustive edge case coverage
- Property-based testing
- Regression tests from production captures
- Fast CI feedback (< 1 second)

### Layer 2: SDK Introspection Tests (Medium - Live Architecture)

Test decision functions with real workflow definitions and context from live infrastructure. Bridges unit tests and E2E.

**Scope:**

- Validate decisions against actual WorkflowDef structures
- Test with real context schemas and values
- Verify condition evaluation with live data
- Debug production issues by replaying state

**Benefits:**

- Realistic workflow structures
- No mocks needed for workflow/context data
- Safe to run against production (read-only)
- Medium speed (hundreds of ms)

### Layer 3: E2E Tests (Slow - Full Stack)

Execute complete workflows with real infrastructure. Validates the entire system works together.

**Scope:**

- Full workflow execution (edge test: ideation → judging → ranking)
- Real Cloudflare services (DO, D1, Workers AI)
- Template rendering, schema validation, action execution
- Token spawning, synchronization, branch isolation

**Benefits:**

- End-to-end validation
- Proves architecture works in practice
- Catches integration issues
- Reference implementation for complex patterns

## Testing Routing Logic

### Unit Tests

```typescript
import { describe, test, expect } from 'vitest';
import * as routing from '~/decisions/routing';

describe('routing.decide', () => {
  test('single matching transition creates one token', () => {
    const token = {
      id: 'tok_123',
      workflow_run_id: 'run_456',
      node_id: 'node_a',
      status: 'completed',
      path_id: 'root',
      parent_token_id: null,
      fan_out_transition_id: null,
      branch_index: 0,
      branch_total: 1,
    };

    const workflow = {
      nodes: [
        { id: 'node_a', ref: 'start', action_id: 'act1' },
        { id: 'node_b', ref: 'next', action_id: 'act2' },
      ],
      transitions: [
        {
          id: 'trans_1',
          from_node_id: 'node_a',
          to_node_id: 'node_b',
          priority: 1,
          condition: null, // Always matches
          spawn_count: null, // Default 1
        },
      ],
    };

    const context = { state: {} };

    const decisions = routing.decide(token, workflow, context);

    expect(decisions).toEqual([
      {
        type: 'CREATE_TOKEN',
        params: {
          workflow_run_id: 'run_456',
          node_id: 'node_b',
          parent_token_id: 'tok_123',
          path_id: 'root.0',
          fan_out_transition_id: null,
          branch_index: 0,
          branch_total: 1,
        },
      },
      {
        type: 'MARK_FOR_DISPATCH',
        tokenId: expect.any(String),
      },
    ]);
  });

  test('spawn_count creates multiple tokens', () => {
    const token = { id: 'tok_123', node_id: 'node_a' /* ... */ };
    const workflow = {
      transitions: [
        {
          id: 'trans_fan_out',
          from_node_id: 'node_a',
          to_node_id: 'node_b',
          spawn_count: 5, // Fan-out
        },
      ],
    };

    const decisions = routing.decide(token, workflow, {});

    const createTokenDecisions = decisions.filter((d) => d.type === 'CREATE_TOKEN');
    expect(createTokenDecisions).toHaveLength(5);

    // Check branch_index and branch_total
    expect(createTokenDecisions[0].params.branch_index).toBe(0);
    expect(createTokenDecisions[0].params.branch_total).toBe(5);
    expect(createTokenDecisions[0].params.fan_out_transition_id).toBe('trans_fan_out');

    expect(createTokenDecisions[4].params.branch_index).toBe(4);
    expect(createTokenDecisions[4].params.branch_total).toBe(5);
  });

  test('condition evaluation filters transitions', () => {
    const workflow = {
      transitions: [
        {
          id: 'trans_approved',
          from_node_id: 'node_a',
          to_node_id: 'node_approved',
          condition: {
            type: 'comparison',
            left: { type: 'field', path: 'state.approved' },
            operator: '==',
            right: { type: 'literal', value: true },
          },
        },
        {
          id: 'trans_rejected',
          from_node_id: 'node_a',
          to_node_id: 'node_rejected',
          condition: {
            type: 'comparison',
            left: { type: 'field', path: 'state.approved' },
            operator: '==',
            right: { type: 'literal', value: false },
          },
        },
      ],
    };

    const context = { state: { approved: true } };

    const decisions = routing.decide(token, workflow, context);

    const createDecisions = decisions.filter((d) => d.type === 'CREATE_TOKEN');
    expect(createDecisions).toHaveLength(1);
    expect(createDecisions[0].params.node_id).toBe('node_approved');
  });

  test('same priority transitions create parallel tokens', () => {
    const workflow = {
      transitions: [
        { id: 'trans_1', from_node_id: 'node_a', to_node_id: 'node_b', priority: 1 },
        { id: 'trans_2', from_node_id: 'node_a', to_node_id: 'node_c', priority: 1 },
      ],
    };

    const decisions = routing.decide(token, workflow, {});

    const createDecisions = decisions.filter((d) => d.type === 'CREATE_TOKEN');
    expect(createDecisions).toHaveLength(2);
    expect(createDecisions[0].params.node_id).toBe('node_b');
    expect(createDecisions[1].params.node_id).toBe('node_c');
  });

  test('synchronization transition creates CHECK_SYNCHRONIZATION decision', () => {
    const workflow = {
      transitions: [
        {
          id: 'trans_merge',
          from_node_id: 'node_judge',
          to_node_id: 'node_merge',
          synchronization: {
            strategy: 'all',
            sibling_group: 'trans_fan_out',
            merge: {
              /* ... */
            },
          },
        },
      ],
    };

    const decisions = routing.decide(token, workflow, {});

    expect(decisions).toContainEqual({
      type: 'CHECK_SYNCHRONIZATION',
      tokenId: 'tok_123',
      transition: expect.objectContaining({
        id: 'trans_merge',
        synchronization: expect.any(Object),
      }),
    });
  });

  test('no matching transitions marks token completed', () => {
    const workflow = { transitions: [] };

    const decisions = routing.decide(token, workflow, {});

    expect(decisions).toEqual([
      {
        type: 'UPDATE_TOKEN_STATUS',
        tokenId: 'tok_123',
        status: 'completed',
      },
    ]);
  });

  test('foreach spawns tokens for each collection item', () => {
    const workflow = {
      transitions: [
        {
          id: 'trans_foreach',
          from_node_id: 'node_a',
          to_node_id: 'node_b',
          foreach: {
            collection: 'state.items',
            item_var: 'item',
          },
        },
      ],
    };

    const context = { state: { items: ['a', 'b', 'c'] } };

    const decisions = routing.decide(token, workflow, context);

    const createDecisions = decisions.filter((d) => d.type === 'CREATE_TOKEN');
    expect(createDecisions).toHaveLength(3);
    expect(createDecisions[0].params.branch_total).toBe(3);
  });
});
```

### Property-Based Tests

```typescript
import * as fc from 'fast-check';

test('routing always creates valid token lineage', () => {
  fc.assert(
    fc.property(
      fc.record({
        token: tokenArbitrary,
        workflow: workflowArbitrary,
        context: contextArbitrary,
      }),
      ({ token, workflow, context }) => {
        const decisions = routing.decide(token, workflow, context);

        // All CREATE_TOKEN decisions have valid parent_token_id
        decisions
          .filter((d) => d.type === 'CREATE_TOKEN')
          .forEach((d) => {
            expect(d.params.parent_token_id).toBe(token.id);
          });
      },
    ),
  );
});
```

### Regression Tests from Production

```typescript
test('production bug: empty foreach should not create tokens', () => {
  // Actual production data that caused bug
  const capturedToken = JSON.parse(productionLog.token);
  const capturedWorkflow = JSON.parse(productionLog.workflow);
  const capturedContext = JSON.parse(productionLog.context);

  const decisions = routing.decide(capturedToken, capturedWorkflow, capturedContext);

  // Bug was creating tokens for empty array
  expect(decisions.filter((d) => d.type === 'CREATE_TOKEN')).toHaveLength(0);
});
```

## Testing Synchronization Logic

### Unit Tests

```typescript
import { describe, test, expect } from 'vitest';
import * as synchronization from '~/decisions/synchronization';

describe('synchronization.decide', () => {
  test('wait_for: all - not all complete creates fan-in token', () => {
    const token = {
      id: 'tok_123',
      workflow_run_id: 'run_456',
      node_id: 'node_judge',
      status: 'completed',
      fan_out_transition_id: 'trans_fan_out',
      branch_index: 0,
      branch_total: 5,
    };

    const siblings = [
      { id: 'tok_123', status: 'completed', branch_index: 0 },
      { id: 'tok_124', status: 'completed', branch_index: 1 },
      { id: 'tok_125', status: 'executing', branch_index: 2 }, // Not done
      { id: 'tok_126', status: 'pending', branch_index: 3 }, // Not done
      { id: 'tok_127', status: 'completed', branch_index: 4 },
    ];

    const transition = {
      id: 'trans_merge',
      from_node_id: 'node_judge',
      to_node_id: 'node_merge',
      synchronization: {
        strategy: 'all',
        sibling_group: 'trans_fan_out',
        merge: {
          source: '*.scores',
          target: '$.state.all_scores',
          strategy: 'append',
        },
      },
    };

    const workflow = {
      /* ... */
    };

    const decisions = synchronization.decide(token, transition, siblings, workflow);

    // Should create waiting token
    expect(decisions).toContainEqual({
      type: 'CREATE_FAN_IN_TOKEN',
      params: expect.objectContaining({
        workflow_run_id: 'run_456',
        node_id: 'node_merge',
        status: 'waiting_for_siblings',
        fan_out_transition_id: 'trans_fan_out',
      }),
    });

    // Should NOT activate or merge yet
    expect(decisions).not.toContainEqual(
      expect.objectContaining({ type: 'ACTIVATE_FAN_IN_TOKEN' }),
    );
  });

  test('wait_for: all - all complete merges and activates', () => {
    const token = {
      id: 'tok_127', // Last sibling completing
      fan_out_transition_id: 'trans_fan_out',
      branch_index: 4,
      branch_total: 5,
    };

    const siblings = [
      { id: 'tok_123', status: 'completed', branch_index: 0 },
      { id: 'tok_124', status: 'completed', branch_index: 1 },
      { id: 'tok_125', status: 'completed', branch_index: 2 },
      { id: 'tok_126', status: 'completed', branch_index: 3 },
      { id: 'tok_127', status: 'completed', branch_index: 4 },
    ];

    const transition = {
      synchronization: {
        strategy: 'all',
        sibling_group: 'trans_fan_out',
        merge: {
          source: '*.name',
          target: '$.state.all_names',
          strategy: 'append',
        },
      },
    };

    const decisions = synchronization.decide(token, transition, siblings, workflow);

    // Should merge branches
    expect(decisions).toContainEqual({
      type: 'MERGE_BRANCHES',
      siblings: expect.arrayContaining([
        expect.objectContaining({ id: 'tok_123', status: 'completed' }),
        expect.objectContaining({ id: 'tok_124', status: 'completed' }),
        expect.objectContaining({ id: 'tok_125', status: 'completed' }),
        expect.objectContaining({ id: 'tok_126', status: 'completed' }),
        expect.objectContaining({ id: 'tok_127', status: 'completed' }),
      ]),
      merge: expect.objectContaining({
        source: '*.name',
        target: '$.state.all_names',
        strategy: 'append',
      }),
      outputSchema: expect.any(Object),
    });

    // Should activate fan-in token
    expect(decisions).toContainEqual({
      type: 'ACTIVATE_FAN_IN_TOKEN',
      workflow_run_id: 'run_456',
      node_id: 'node_merge',
      path_id: expect.stringContaining('fanin'),
    });
  });

  test('wait_for: any - first completion activates', () => {
    const token = {
      id: 'tok_123', // First to complete
      fan_out_transition_id: 'trans_fan_out',
    };

    const siblings = [
      { id: 'tok_123', status: 'completed' }, // This one
      { id: 'tok_124', status: 'executing' },
      { id: 'tok_125', status: 'pending' },
    ];

    const transition = {
      synchronization: {
        strategy: 'any',
        sibling_group: 'trans_fan_out',
        merge: {
          source: '*.result',
          target: '$.state.first_result',
          strategy: 'last_wins',
        },
      },
    };

    const decisions = synchronization.decide(token, transition, siblings, workflow);

    // Should activate immediately
    expect(decisions).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN_TOKEN' }));

    // Should merge just the completed sibling
    expect(decisions).toContainEqual({
      type: 'MERGE_BRANCHES',
      siblings: [expect.objectContaining({ id: 'tok_123', status: 'completed' })],
      merge: expect.any(Object),
      outputSchema: expect.any(Object),
    });
  });

  test('wait_for: m_of_n - activates when threshold met', () => {
    const token = {
      id: 'tok_125', // Third completion
      fan_out_transition_id: 'trans_fan_out',
    };

    const siblings = [
      { id: 'tok_123', status: 'completed' },
      { id: 'tok_124', status: 'completed' },
      { id: 'tok_125', status: 'completed' }, // 3 of 5 done
      { id: 'tok_126', status: 'executing' },
      { id: 'tok_127', status: 'pending' },
    ];

    const transition = {
      synchronization: {
        strategy: { m_of_n: 3 }, // Need 3 out of 5
        sibling_group: 'trans_fan_out',
        merge: {
          source: '*.vote',
          target: '$.state.votes',
          strategy: 'append',
        },
      },
    };

    const decisions = synchronization.decide(token, transition, siblings, workflow);

    // Should activate (3 >= 3)
    expect(decisions).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN_TOKEN' }));

    // Should merge only completed siblings
    expect(decisions).toContainEqual({
      type: 'MERGE_BRANCHES',
      siblings: [
        expect.objectContaining({ id: 'tok_123', status: 'completed' }),
        expect.objectContaining({ id: 'tok_124', status: 'completed' }),
        expect.objectContaining({ id: 'tok_125', status: 'completed' }),
      ],
      merge: expect.any(Object),
      outputSchema: expect.any(Object),
    });
  });

  test('m_of_n - waits when threshold not met', () => {
    const siblings = [
      { id: 'tok_123', status: 'completed' },
      { id: 'tok_124', status: 'completed' }, // Only 2 of 5 done
      { id: 'tok_125', status: 'executing' },
      { id: 'tok_126', status: 'executing' },
      { id: 'tok_127', status: 'pending' },
    ];

    const transition = {
      synchronization: {
        strategy: { m_of_n: 3 }, // Need 3, only have 2
        sibling_group: 'trans_fan_out',
      },
    };

    const decisions = synchronization.decide(token, transition, siblings, workflow);

    // Should create waiting token
    expect(decisions).toContainEqual(expect.objectContaining({ type: 'CREATE_FAN_IN_TOKEN' }));

    // Should NOT activate
    expect(decisions).not.toContainEqual(
      expect.objectContaining({ type: 'ACTIVATE_FAN_IN_TOKEN' }),
    );
  });

  test('token not in sibling group returns empty decisions', () => {
    const token = {
      id: 'tok_999',
      fan_out_transition_id: 'different_fan_out', // Different group
    };

    const siblings = [
      { id: 'tok_123', fan_out_transition_id: 'trans_fan_out' },
      { id: 'tok_124', fan_out_transition_id: 'trans_fan_out' },
    ];

    const transition = {
      synchronization: {
        sibling_group: 'trans_fan_out', // Different from token
      },
    };

    const decisions = synchronization.decide(token, transition, siblings, workflow);

    expect(decisions).toEqual([]);
  });

  test('race condition: multiple siblings complete simultaneously', () => {
    // Simulate last two siblings completing at same time
    const token1 = { id: 'tok_124', status: 'completed' };
    const token2 = { id: 'tok_125', status: 'completed' };

    const siblings = [
      { id: 'tok_123', status: 'completed' },
      { id: 'tok_124', status: 'completed' },
      { id: 'tok_125', status: 'completed' },
    ];

    const transition = {
      synchronization: { strategy: 'all', sibling_group: 'trans_fan_out' },
    };

    // Both should generate ACTIVATE decisions
    const decisions1 = synchronization.decide(token1, transition, siblings, workflow);
    const decisions2 = synchronization.decide(token2, transition, siblings, workflow);

    expect(decisions1).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN_TOKEN' }));
    expect(decisions2).toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN_TOKEN' }));

    // Dispatch layer uses tryActivate() - only one succeeds in SQL
  });
});
```

### Property-Based Tests

```typescript
test('synchronization decisions are idempotent', () => {
  fc.assert(
    fc.property(
      fc.record({
        token: tokenArbitrary,
        siblings: siblingsArbitrary,
        transition: transitionArbitrary,
      }),
      ({ token, siblings, transition }) => {
        const decisions1 = synchronization.decide(token, transition, siblings, workflow);
        const decisions2 = synchronization.decide(token, transition, siblings, workflow);

        // Same inputs = same decisions
        expect(decisions1).toEqual(decisions2);
      },
    ),
  );
});
```

## SDK Introspection Tests

The SDK can be extended to introspect coordinator state and validate decision behavior against live architecture.

### SDK Extensions

```typescript
// @wonder/sdk - new module: sdk/testing.ts

export interface CoordinatorIntrospection {
  // Read coordinator state without side effects
  getTokens(workflowRunId: string): Promise<TokenRow[]>;
  getContext(workflowRunId: string): Promise<ContextSnapshot>;
  getWorkflowDef(workflowDefId: string, version: number): Promise<WorkflowDef>;

  // Simulate decision logic with live data
  simulateRouting(tokenId: string): Promise<{
    token: TokenRow;
    workflow: WorkflowDef;
    context: ContextSnapshot;
    decisions: Decision[];
  }>;

  simulateSynchronization(
    tokenId: string,
    transitionId: string,
  ): Promise<{
    token: TokenRow;
    siblings: TokenRow[];
    transition: TransitionDef;
    decisions: Decision[];
  }>;
}
```

### Coordinator Introspection RPC Methods

```typescript
// coordinator/src/index.ts

class WorkflowCoordinator extends DurableObject {
  // Existing RPC methods
  async start(workflowRunId: string, input: object): Promise<void> {
    /* ... */
  }
  async handleTaskResult(tokenId: string, result: TaskResult): Promise<void> {
    /* ... */
  }

  // NEW: Testing introspection methods
  async introspectTokens(workflowRunId: string): Promise<TokenRow[]> {
    return operations.tokens.getAll(this.sql, workflowRunId);
  }

  async introspectContext(workflowRunId: string): Promise<ContextSnapshot> {
    return operations.context.getSnapshot(this.sql);
  }

  async simulateRouting(tokenId: string): Promise<RoutingSimulation> {
    const token = operations.tokens.get(this.sql, tokenId);
    const workflow = await this.getWorkflow(token.workflow_run_id);
    const context = operations.context.getSnapshot(this.sql);

    // Call pure decision function
    const decisions = routing.decide(token, workflow, context);

    return { token, workflow, context, decisions };
  }

  async simulateSynchronization(
    tokenId: string,
    transitionId: string,
  ): Promise<SynchronizationSimulation> {
    const token = operations.tokens.get(this.sql, tokenId);
    const workflow = await this.getWorkflow(token.workflow_run_id);
    const transition = workflow.transitions.find((t) => t.id === transitionId);
    const siblings = operations.tokens.getSiblings(
      this.sql,
      token.workflow_run_id,
      token.fan_out_transition_id,
    );

    // Call pure decision function
    const decisions = synchronization.decide(token, transition, siblings, workflow);

    return { token, siblings, transition, decisions };
  }
}
```

### Test Patterns with Live Architecture

#### Complex Workflow Validation

```typescript
test('nested fan-out routing decisions are correct', async () => {
  const sdk = createSDK();

  // Create complex workflow (ideation → judging → ranking)
  const { workflow_def_id } = await createEdgeTestWorkflow(sdk);
  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});

  // Wait for first fan-out completion
  await waitForNodeCompletion(workflow_run_id, 'ideation_node');

  // Get one completed ideation token
  const tokens = await sdk.testing.getTokens(workflow_run_id);
  const ideationToken = tokens.find(
    (t) => t.node_ref === 'ideation_node' && t.status === 'completed',
  );

  // Simulate routing from that token
  const { decisions } = await sdk.testing.simulateRouting(ideationToken.id);

  // Should create CHECK_SYNCHRONIZATION (not direct dispatch)
  expect(decisions).toContainEqual({
    type: 'CHECK_SYNCHRONIZATION',
    tokenId: ideationToken.id,
    transition: expect.objectContaining({
      synchronization: expect.objectContaining({
        strategy: 'all',
        sibling_group: expect.any(String),
      }),
    }),
  });
});
```

#### Synchronization State Validation

```typescript
test('synchronization correctly waits for all siblings', async () => {
  const sdk = createSDK();

  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});

  // Wait for 3 out of 10 ideators to complete
  await waitForCompletionCount(workflow_run_id, 'ideation_node', 3);

  // Get any completed token
  const tokens = await sdk.testing.getTokens(workflow_run_id);
  const completedToken = tokens.find(
    (t) => t.node_ref === 'ideation_node' && t.status === 'completed',
  );

  // Simulate synchronization
  const transition = findSynchronizationTransition(workflow);
  const { decisions, siblings } = await sdk.testing.simulateSynchronization(
    completedToken.id,
    transition.id,
  );

  // With only 3 of 10 complete, should wait
  const completedCount = siblings.filter((s) => s.status === 'completed').length;
  expect(completedCount).toBe(3);

  expect(decisions).toContainEqual({
    type: 'CREATE_FAN_IN_TOKEN',
    params: expect.objectContaining({
      status: 'waiting_for_siblings',
    }),
  });

  // Should NOT activate
  expect(decisions).not.toContainEqual(expect.objectContaining({ type: 'ACTIVATE_FAN_IN_TOKEN' }));
});
```

#### Decision Determinism Validation

```typescript
test('same state produces same decisions (idempotence)', async () => {
  const sdk = createSDK();

  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});
  await waitForNodeCompletion(workflow_run_id, 'node_a');

  const tokens = await sdk.testing.getTokens(workflow_run_id);
  const token = tokens.find((t) => t.node_ref === 'node_a');

  // Simulate twice
  const result1 = await sdk.testing.simulateRouting(token.id);
  const result2 = await sdk.testing.simulateRouting(token.id);

  // Decisions should be identical
  expect(result1.decisions).toEqual(result2.decisions);

  // Context should be unchanged (read-only)
  expect(result1.context).toEqual(result2.context);
});
```

#### Condition Evaluation Testing

```typescript
test('complex conditions evaluated correctly with live context', async () => {
  const sdk = createSDK();

  // Create workflow with complex condition
  const { workflow_def_id } = await sdk.workflows.createDef({
    transitions: [
      {
        from_node_ref: 'analyze',
        to_node_ref: 'escalate',
        condition: {
          type: 'and',
          conditions: [
            { field: 'state.score', operator: '>', value: 80 },
            { field: 'state.risk_level', operator: '==', value: 'high' },
          ],
        },
      },
    ],
  });

  const { workflow_run_id } = await sdk.workflows.start(workflow_id, {});

  // Set context state
  await sdk.context.set(workflow_run_id, 'state.score', 85);
  await sdk.context.set(workflow_run_id, 'state.risk_level', 'high');

  // Complete node
  await completeNode(workflow_run_id, 'analyze');

  const tokens = await sdk.testing.getTokens(workflow_run_id);
  const token = tokens.find((t) => t.node_ref === 'analyze');

  // Simulate routing
  const { decisions } = await sdk.testing.simulateRouting(token.id);

  // Should route to escalate (both conditions true)
  expect(decisions).toContainEqual({
    type: 'CREATE_TOKEN',
    params: expect.objectContaining({
      node_id: expect.any(String), // escalate node
    }),
  });
});
```

#### Debug Production Issues

```typescript
test('replay production failure', async () => {
  // Capture production state
  const prodToken = await sdk.testing.getTokens(prod_workflow_run_id);
  const prodContext = await sdk.testing.getContext(prod_workflow_run_id);

  // Replay locally
  const { decisions } = await sdk.testing.simulateRouting(token.id);

  // Inspect what coordinator would have decided
  console.log('Production decisions:', decisions);

  // Validate fix
  expect(decisions).not.toContainEqual(expect.objectContaining({ type: 'ERROR_DECISION' }));
});
```

## E2E Tests

Full workflow execution validates the entire system.

### Edge Test (Reference Implementation)

The edge test in `packages/test/src/tests/edge.test.ts` is the canonical E2E validation:

```typescript
test('fan-out → merge → fan-out → merge → rank', async () => {
  // Setup: Create workspace, project, model profile, prompt specs, actions

  // Create workflow: ideation (10x) → merge → judging (5x) → merge → ranking
  const { workflow_def_id } = await client.POST('/api/workflow-defs', {
    body: {
      nodes: [
        { ref: 'start_node', name: 'Start' },
        { ref: 'ideation_node', name: 'Dog Name Ideation', action_id: ideationActionId },
        { ref: 'merge_names_node', name: 'Merge Names' },
        { ref: 'judging_node', name: 'Judge Names', action_id: judgingActionId },
        { ref: 'merge_scores_node', name: 'Merge Judge Scores' },
        { ref: 'ranking_node', name: 'Final Ranking', action_id: rankingActionId },
      ],
      transitions: [
        {
          ref: 'start_to_ideation',
          from_node_ref: 'start_node',
          to_node_ref: 'ideation_node',
          spawn_count: 10, // Fan-out 10 ideators
        },
        {
          ref: 'ideation_to_merge',
          from_node_ref: 'ideation_node',
          to_node_ref: 'merge_names_node',
          synchronization: {
            wait_for: 'all',
            joins_transition: 'start_to_ideation',
            merge: {
              source: '*.name',
              target: '$.merge_names_node_output.all_names',
              strategy: 'array',
            },
          },
        },
        {
          ref: 'merge_to_judging',
          from_node_ref: 'merge_names_node',
          to_node_ref: 'judging_node',
          spawn_count: 5, // Fan-out 5 judges
        },
        {
          ref: 'judging_to_merge',
          from_node_ref: 'judging_node',
          to_node_ref: 'merge_scores_node',
          synchronization: {
            wait_for: 'all',
            joins_transition: 'merge_to_judging',
            merge: {
              source: '*.scores',
              target: '$.merge_scores_node_output.all_scores',
              strategy: 'array',
            },
          },
        },
        {
          ref: 'merge_to_ranking',
          from_node_ref: 'merge_scores_node',
          to_node_ref: 'ranking_node',
        },
      ],
    },
  });

  // Execute workflow
  const { workflow_run_id } = await client.POST('/api/workflows/{id}/start', {
    params: { path: { id: workflow_id } },
    body: {},
  });

  console.log('✓ Workflow started:', workflow_run_id);
  console.log(`  Flow: 10 names → 5 judges → final ranking`);
});
```

**What this validates:**

- Two-stage fan-out pattern (10x → 5x)
- Template rendering (`{{#each names}}`, `{{#each judge_scores}}{{#each this}}`)
- Branch isolation (each token writes to separate tables)
- Merge strategies (append arrays)
- Schema-driven context (validated I/O)
- Transition-centric control flow
- Real LLM integration (Cloudflare Workers AI)

### Integration Tests for Operations

Test decision application with real SQL (actor state mutations):

```typescript
test('tryActivate handles race condition', async () => {
  const sql = miniflare.getDurableObjectStorage();

  // Create waiting token
  operations.tokens.create(sql, { ...params, status: 'waiting_for_siblings' });

  // Two concurrent activations
  const [result1, result2] = await Promise.all([
    operations.tokens.tryActivate(sql, workflowRunId, nodeId, path),
    operations.tokens.tryActivate(sql, workflowRunId, nodeId, path),
  ]);

  expect([result1, result2]).toEqual([true, false]); // Only one succeeds
});
```

## Benefits Summary

**Unit Tests (Layer 1):**

- Millisecond execution time
- Exhaustive edge case coverage
- Property-based testing
- No infrastructure dependencies
- Regression tests from production

**SDK Introspection Tests (Layer 2):**

- Realistic workflow structures
- Live context and schema validation
- Debug production issues safely
- Medium speed (hundreds of ms)
- No mocks for workflow/context data

**E2E Tests (Layer 3):**

- End-to-end validation
- Proves architecture works in practice
- Real Cloudflare infrastructure
- Template + schema + action execution
- Reference implementation

**Core Advantage:**
The Decision Pattern makes business logic testable without mocks while maintaining the benefits of the Actor Model (isolated state, single-threaded execution, message passing). Fast feedback loops enable rapid iteration while comprehensive E2E tests ensure production readiness.
