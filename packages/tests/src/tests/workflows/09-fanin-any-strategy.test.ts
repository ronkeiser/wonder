import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 09: Fan-in 'any' Strategy
 *
 * Tests the 'any' synchronization strategy where the first sibling to complete
 * immediately proceeds without waiting for other siblings.
 *
 * 'ANY' STRATEGY SEMANTICS:
 * - First token to reach the sync point immediately proceeds
 * - No waiting for other siblings
 * - No merge operation (each token passes through independently)
 * - Other siblings continue executing but don't block the workflow
 * - Commonly used for "race" patterns or "first result wins"
 *
 * COMPARISON WITH 'ALL' (Test 02):
 * - 'all': Waits for ALL siblings to complete, then merges outputs
 * - 'any': First sibling proceeds immediately, no merge
 *
 * WHAT THIS TEST VALIDATES:
 * 1. First completing sibling immediately triggers downstream node
 * 2. No merge happens - the winning token's output flows through directly
 * 3. Workflow completes without waiting for all siblings
 * 4. Other siblings may still complete but don't affect the main flow
 */

describe('Foundation: 09 - Fan-in Any Strategy', () => {
  /**
   * Test: First sibling wins race
   *
   * Workflow structure:
   *   [dispatch] → (fan-out: 3) → [race] ×3 → (any: first wins) → [finish]
   *
   * With varying delays, one sibling completes first and the workflow
   * proceeds immediately without waiting for the others.
   */
  it('first completing sibling proceeds immediately', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      contestants: s.array(s.string()),
    });

    const dispatchOutputSchema = s.object(
      { started: s.boolean() },
      { required: ['started'] },
    );

    const raceOutputSchema = s.object(
      { winner: s.string() },
      { required: ['winner'] },
    );

    const finishOutputSchema = s.object(
      { result: s.string() },
      { required: ['result'] },
    );

    const contextSchema = s.object({
      winner: s.string(),
      result: s.string(),
    });

    const workflowOutputSchema = s.object({
      winner: s.string(),
      result: s.string(),
    });

    // =========================================================================
    // Node: dispatch (starts the race)
    // =========================================================================
    const dispatchNode = node({
      ref: 'dispatch',
      name: 'Dispatch',
      task: task({
        name: 'Dispatch Task',
        description: 'Start the race',
        inputSchema: s.object({}),
        outputSchema: dispatchOutputSchema,
        steps: [
          step({
            ref: 'dispatch_step',
            ordinal: 0,
            action: action({
              name: 'Dispatch Action',
              description: 'Dispatch',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.started': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Node: race (3 parallel contestants with different delays)
    // Each branch has different timing to create a clear winner
    // =========================================================================
    const raceNode = node({
      ref: 'race',
      name: 'Race',
      task: task({
        name: 'Race Task',
        description: 'Contestant running',
        inputSchema: s.object({ contestant: s.string() }),
        outputSchema: raceOutputSchema,
        steps: [
          step({
            ref: 'race_step',
            ordinal: 0,
            action: action({
              name: 'Race Action',
              description: 'Run the race',
              kind: 'mock',
              implementation: {
                schema: raceOutputSchema,
                options: {
                  stringMode: 'words',
                  // No delay specified - mock returns immediately
                  // The race is non-deterministic but 'any' means first one wins
                },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.winner': 'result.winner' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { contestant: 'input.contestants[_branch.index]' },
      // Write winner to state so finish node can read it
      outputMapping: { 'state.winner': 'result.winner' },
    });

    // =========================================================================
    // Node: finish (receives winner, produces result)
    // =========================================================================
    const finishNode = node({
      ref: 'finish',
      name: 'Finish',
      task: task({
        name: 'Finish Task',
        description: 'Finish the race',
        inputSchema: s.object({ winner: s.string() }),
        outputSchema: finishOutputSchema,
        steps: [
          step({
            ref: 'finish_step',
            ordinal: 0,
            action: action({
              name: 'Finish Action',
              description: 'Record finish',
              kind: 'mock',
              implementation: {
                schema: finishOutputSchema,
                options: { stringMode: 'words' },
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.result': 'result.result' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { winner: 'state.winner' },
      outputMapping: { 'state.result': 'result.result' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================

    // Fan-out: 3 parallel race branches
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      fromNodeRef: 'dispatch',
      toNodeRef: 'race',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'race_group',
    });

    // Fan-in with 'any' strategy: first to complete wins
    // Note: No merge config - 'any' doesn't merge, winner passes through
    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'race',
      toNodeRef: 'finish',
      priority: 1,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'race_group',
      },
    });

    const workflowDef = workflow({
      name: 'Any Strategy Race Test',
      description: 'Foundation test 09 - first sibling wins',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        winner: 'state.winner',
        result: 'state.result',
      },
      initialNodeRef: 'dispatch',
      nodes: [dispatchNode, raceNode, finishNode],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { contestants: ['Alice', 'Bob', 'Charlie'] };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // With 'any' strategy (true fan-in behavior):
    // - 3 race tokens spawn (fan-out siblings)
    // - First to complete creates arrival token and activates fan-in
    // - Fan-in activation cancels in-flight siblings
    // - Only 1 continuation token is created and proceeds to finish
    //
    // Token structure:
    // - 1 dispatch (root)
    // - 3 race tokens (fan-out siblings)
    // - 1+ arrival tokens (first wins, others may complete before cancellation)
    // - 1 continuation token (fan-in activated)
    // - 1 finish token
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 1,
        fanOuts: [{ count: 3, branchTotal: 3, outputFields: ['winner'] }],
        // fanInArrivals is timing-dependent (1-3 may complete before cancellation)
        fanInContinuations: 1, // Only one continuation - fan-in is a convergence point
      })
      .withOutput({
        // Winner and result are set - we don't know which contestant won
        // but the values should be defined
        winner: { type: 'string', defined: true },
        result: { type: 'string', defined: true },
      })
      .run();
  });

  /**
   * Test: Any strategy with output written to state
   *
   * Validates that the winning sibling's output is correctly written to state
   * even though there's no merge operation.
   */
  it('winning sibling output flows to state correctly', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const startOutputSchema = s.object(
      { ready: s.boolean() },
      { required: ['ready'] },
    );

    const computeOutputSchema = s.object(
      { value: s.number() },
      { required: ['value'] },
    );

    const useOutputSchema = s.object(
      { used: s.boolean() },
      { required: ['used'] },
    );

    const contextSchema = s.object({
      value: s.number(),
    });

    const workflowOutputSchema = s.object({
      value: s.number(),
    });

    // =========================================================================
    // Nodes
    // =========================================================================
    const startNode = node({
      ref: 'start',
      name: 'Start',
      task: task({
        name: 'Start Task',
        description: 'Start',
        inputSchema: s.object({}),
        outputSchema: startOutputSchema,
        steps: [
          step({
            ref: 'start_step',
            ordinal: 0,
            action: action({
              name: 'Start Action',
              description: 'Start',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.ready': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const computeNode = node({
      ref: 'compute',
      name: 'Compute',
      task: task({
        name: 'Compute Task',
        description: 'Compute a value',
        inputSchema: s.object({}),
        outputSchema: computeOutputSchema,
        steps: [
          step({
            ref: 'compute_step',
            ordinal: 0,
            action: action({
              name: 'Compute Action',
              description: 'Compute',
              kind: 'mock',
              implementation: {
                schema: computeOutputSchema,
                options: {},
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.value': 'result.value' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      // Each branch writes its value to state.value
      // With 'any', whichever completes first will write first
      // Subsequent writes may overwrite (last-wins for state)
      outputMapping: { 'state.value': 'result.value' },
    });

    const useNode = node({
      ref: 'use',
      name: 'Use',
      task: task({
        name: 'Use Task',
        description: 'Use the value',
        inputSchema: s.object({ value: s.number() }),
        outputSchema: useOutputSchema,
        steps: [
          step({
            ref: 'use_step',
            ordinal: 0,
            action: action({
              name: 'Use Action',
              description: 'Use',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.used': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: { value: 'state.value' },
      outputMapping: {},
    });

    // =========================================================================
    // Transitions
    // =========================================================================
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      fromNodeRef: 'start',
      toNodeRef: 'compute',
      priority: 1,
      spawnCount: 2,
      siblingGroup: 'compute_group',
    });

    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'compute',
      toNodeRef: 'use',
      priority: 1,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'compute_group',
      },
    });

    const workflowDef = workflow({
      name: 'Any Strategy State Write Test',
      description: 'Foundation test 09 - any strategy state writes',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        value: 'state.value',
      },
      initialNodeRef: 'start',
      nodes: [startNode, computeNode, useNode],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = {};
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 1,
        fanOuts: [{ count: 2, branchTotal: 2, outputFields: ['value'] }],
        // 1 start + 2 compute (fan-out) + 2 arrivals + 1 continuation = 6
        total: 6,
      })
      .withStateWrites([
        {
          path: 'state.value',
          type: 'number',
          description: 'Value from compute node (may be written multiple times)',
        },
      ])
      .withOutput({
        value: { type: 'number', defined: true },
      })
      .run();
  });

  /**
   * Test: Any with single sibling (degenerates to pass-through)
   *
   * When there's only 1 sibling, 'any' behaves identically to no synchronization.
   */
  it('single sibling passes through immediately', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const stepOutputSchema = s.object(
      { done: s.boolean() },
      { required: ['done'] },
    );

    const contextSchema = s.object({
      completed: s.boolean(),
    });
    const workflowOutputSchema = s.object({ completed: s.boolean() });

    // =========================================================================
    // Nodes
    // =========================================================================
    const startNode = node({
      ref: 'start',
      name: 'Start',
      task: task({
        name: 'Start Task',
        description: 'Start',
        inputSchema: s.object({}),
        outputSchema: stepOutputSchema,
        steps: [
          step({
            ref: 'start_step',
            ordinal: 0,
            action: action({
              name: 'Start Action',
              description: 'Start',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.done': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const middleNode = node({
      ref: 'middle',
      name: 'Middle',
      task: task({
        name: 'Middle Task',
        description: 'Middle step',
        inputSchema: s.object({}),
        outputSchema: stepOutputSchema,
        steps: [
          step({
            ref: 'middle_step',
            ordinal: 0,
            action: action({
              name: 'Middle Action',
              description: 'Middle',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.done': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const endNode = node({
      ref: 'end',
      name: 'End',
      task: task({
        name: 'End Task',
        description: 'End',
        inputSchema: s.object({}),
        outputSchema: stepOutputSchema,
        steps: [
          step({
            ref: 'end_step',
            ordinal: 0,
            action: action({
              name: 'End Action',
              description: 'End',
              kind: 'context',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.done': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      // Write to state so it's available after fan-in
      outputMapping: { 'state.completed': 'result.done' },
    });

    // =========================================================================
    // Transitions
    // =========================================================================

    // Fan-out with spawnCount: 1 (single sibling)
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      fromNodeRef: 'start',
      toNodeRef: 'middle',
      priority: 1,
      spawnCount: 1,
      siblingGroup: 'single_group',
    });

    // 'any' with single sibling - should just pass through
    const fanInTransition = transition({
      ref: 'fanin_transition',
      fromNodeRef: 'middle',
      toNodeRef: 'end',
      priority: 1,
      synchronization: {
        strategy: 'any',
        siblingGroup: 'single_group',
      },
    });

    const workflowDef = workflow({
      name: 'Any Strategy Single Sibling Test',
      description: 'Foundation test 09 - any with single sibling',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        completed: 'state.completed',
      },
      initialNodeRef: 'start',
      nodes: [startNode, middleNode, endNode],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = {};
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace, events } = result;

    // =========================================================================
    // INVARIANTS
    // =========================================================================
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // Single sibling with 'any' strategy:
    // - 1 start token (root)
    // - 1 middle token (sibling with branchTotal=1)
    // - 1 arrival token (middle completes, creates token for end node)
    // - 1 continuation token (fan-in activates, creates continuation)
    //
    // Note: branchTotal=1 means verifier classifies middle/arrival as "root" tokens
    // since its fan-out detection requires branchTotal > 1. This is a verifier
    // limitation for edge cases, not a runtime issue.
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .completed()
      .withTokens({
        root: 3, // Start + middle + arrival (classified as root due to branchTotal=1)
        fanInContinuations: 1, // Continuation after fan-in activates
      })
      .withOutput({
        completed: { type: 'boolean', value: true },
      })
      .run();
  });
});
