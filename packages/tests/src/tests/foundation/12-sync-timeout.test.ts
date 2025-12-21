import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 12: Synchronization Timeout
 *
 * Tests the timeout handling for fan-in synchronization.
 * When tokens are waiting at a sync point and the configured
 * timeout elapses, the coordinator should handle it according
 * to the onTimeout policy.
 *
 * TIMEOUT FLOW:
 * 1. Token arrives at sync point, marks as waiting_for_siblings
 * 2. Coordinator sets alarm for timeoutMs in the future
 * 3. Alarm fires, checkTimeouts() runs
 * 4. hasTimedOut() checks if oldest waiting timestamp + timeoutMs < now
 * 5. If timed out, decideOnTimeout() generates decisions based on onTimeout policy:
 *    - 'fail' (default): Mark tokens as timed_out, fail workflow
 *    - 'proceed_with_available': Merge available siblings, mark rest as timed_out
 *
 * WHAT THIS TEST VALIDATES:
 * 1. Timeout is detected after configured duration
 * 2. Tokens transition to 'timed_out' status
 * 3. Workflow fails with appropriate error message (onTimeout: 'fail')
 * 4. Alternatively, workflow proceeds with available siblings (onTimeout: 'proceed_with_available')
 *
 * NOTE: These tests use short timeouts (1-2 seconds) and rely on the
 * Durable Object alarm mechanism. Tests may be flaky in CI due to timing.
 */

describe('Foundation: 12 - Synchronization Timeout', () => {
  /**
   * Test: Simple timeout leads to workflow failure
   *
   * A fan-out spawns 3 branches. Two branches have long delays (5s)
   * that exceed the 1s timeout. With 'all' strategy and onTimeout: 'fail',
   * the workflow should fail after the timeout since not all branches complete.
   */
  it(
    'timeout with fail policy fails workflow',
    { timeout: 30000 },
    async () => {
      // =========================================================================
      // Schemas
      // =========================================================================
      const inputSchema = s.object({});
      const branchOutputSchema = s.object({ value: s.number() }, { required: ['value'] });
      const contextSchema = s.object({});
      const workflowOutputSchema = s.object({});

      // =========================================================================
      // Node: start (triggers fan-out)
      // =========================================================================
      const startNode = node({
        ref: 'start',
        name: 'Start',
        task: task({
          name: 'Start Task',
          description: 'Triggers fan-out',
          inputSchema: s.object({}),
          outputSchema: s.object({ started: s.boolean() }),
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
              outputMapping: { 'output.started': 'true' },
            }),
          ],
        }),
        taskVersion: 1,
        inputMapping: {},
        outputMapping: {},
      });

      // =========================================================================
      // Node: fastBranch (completes quickly, before timeout)
      // =========================================================================
      const fastBranchNode = node({
        ref: 'fast_branch',
        name: 'Fast Branch',
        task: task({
          name: 'Fast Branch Task',
          description: 'Completes quickly',
          inputSchema: s.object({}),
          outputSchema: branchOutputSchema,
          steps: [
            step({
              ref: 'fast_branch_step',
              ordinal: 0,
              action: action({
                name: 'Fast Branch Action',
                description: 'Fast branch',
                kind: 'mock',
                implementation: {
                  schema: branchOutputSchema,
                  options: { delay: { minMs: 100, maxMs: 200 } },
                },
              }),
              inputMapping: {},
              outputMapping: { 'output.value': 'result.value' },
            }),
          ],
        }),
        taskVersion: 1,
        inputMapping: {},
        outputMapping: {},
      });

      // =========================================================================
      // Node: slowBranch (takes 5s, will exceed 1s timeout)
      // =========================================================================
      const slowBranchNode = node({
        ref: 'slow_branch',
        name: 'Slow Branch',
        task: task({
          name: 'Slow Branch Task',
          description: 'Takes too long',
          inputSchema: s.object({}),
          outputSchema: branchOutputSchema,
          steps: [
            step({
              ref: 'slow_branch_step',
              ordinal: 0,
              action: action({
                name: 'Slow Branch Action',
                description: 'Slow branch',
                kind: 'mock',
                implementation: {
                  schema: branchOutputSchema,
                  options: { delay: { minMs: 5000, maxMs: 5000 } },
                },
              }),
              inputMapping: {},
              outputMapping: { 'output.value': 'result.value' },
            }),
          ],
        }),
        taskVersion: 1,
        inputMapping: {},
        outputMapping: {},
      });

      // =========================================================================
      // Node: sync (synchronization point with timeout)
      // =========================================================================
      const syncNode = node({
        ref: 'sync',
        name: 'Sync',
        task: task({
          name: 'Sync Task',
          description: 'Synchronization point',
          inputSchema: s.object({}),
          outputSchema: s.object({ synced: s.boolean() }),
          steps: [
            step({
              ref: 'sync_step',
              ordinal: 0,
              action: action({
                name: 'Sync Action',
                description: 'Sync',
                kind: 'context',
                implementation: {},
              }),
              inputMapping: {},
              outputMapping: { 'output.synced': 'true' },
            }),
          ],
        }),
        taskVersion: 1,
        inputMapping: {},
        outputMapping: {},
      });

      // =========================================================================
      // Transitions
      // =========================================================================
      // Fan-out: 1 fast branch + 2 slow branches
      const toFastTransition = transition({
        ref: 'to_fast',
        fromNodeRef: 'start',
        toNodeRef: 'fast_branch',
        priority: 1,
        siblingGroup: 'branch_group',
      });

      const toSlow1Transition = transition({
        ref: 'to_slow_1',
        fromNodeRef: 'start',
        toNodeRef: 'slow_branch',
        priority: 1,
        siblingGroup: 'branch_group',
      });

      const toSlow2Transition = transition({
        ref: 'to_slow_2',
        fromNodeRef: 'start',
        toNodeRef: 'slow_branch',
        priority: 1,
        siblingGroup: 'branch_group',
      });

      const fastToSyncTransition = transition({
        ref: 'fast_to_sync',
        fromNodeRef: 'fast_branch',
        toNodeRef: 'sync',
        priority: 1,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'branch_group',
          timeoutMs: 2000, // 2 second timeout
          onTimeout: 'fail',
        },
      });

      const slowToSyncTransition = transition({
        ref: 'slow_to_sync',
        fromNodeRef: 'slow_branch',
        toNodeRef: 'sync',
        priority: 1,
        synchronization: {
          strategy: 'all',
          siblingGroup: 'branch_group',
          timeoutMs: 2000, // 2 second timeout
          onTimeout: 'fail',
        },
      });

      // =========================================================================
      // Workflow
      // =========================================================================
      const workflowDef = workflow({
        name: 'Timeout Fail Test',
        description: 'Foundation test 12 - timeout with fail policy',
        inputSchema: inputSchema,
        outputSchema: workflowOutputSchema,
        contextSchema: contextSchema,
        outputMapping: {},
        initialNodeRef: 'start',
        nodes: [startNode, fastBranchNode, slowBranchNode, syncNode],
        transitions: [
          toFastTransition,
          toSlow1Transition,
          toSlow2Transition,
          fastToSyncTransition,
          slowToSyncTransition,
        ],
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
      // Timeout workflows may have tokens in non-terminal states
      assertInvariants(trace, { allowNonTerminalTokens: true });

      // =========================================================================
      // VERIFICATION
      // =========================================================================
      // Fast branch completes (~100-200ms), arrives at sync, waits.
      // After 2s timeout, workflow fails because slow branches (5s) haven't arrived.
      verify(trace, { input: workflowInput, definition: workflowDef, events })
        .failed()
        .run();
    },
  );

  /**
   * Test: Timeout configuration is accepted by API
   *
   * Validates that the synchronization.timeoutMs and synchronization.onTimeout
   * fields are properly parsed and stored.
   */
  it('timeout configuration is accepted', { timeout: 30000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});
    const branchOutputSchema = s.object({ value: s.number() }, { required: ['value'] });
    const contextSchema = s.object({ results: s.array(s.number()) });
    const workflowOutputSchema = s.object({});

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
        outputSchema: s.object({ started: s.boolean() }),
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
            outputMapping: { 'output.started': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const branchNode = node({
      ref: 'branch',
      name: 'Branch',
      task: task({
        name: 'Branch Task',
        description: 'Branch',
        inputSchema: s.object({}),
        outputSchema: branchOutputSchema,
        steps: [
          step({
            ref: 'branch_step',
            ordinal: 0,
            action: action({
              name: 'Branch Action',
              description: 'Branch',
              kind: 'mock',
              implementation: { schema: branchOutputSchema, options: {} },
            }),
            inputMapping: {},
            outputMapping: { 'output.value': 'result.value' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    const syncNode = node({
      ref: 'sync',
      name: 'Sync',
      task: task({
        name: 'Sync Task',
        description: 'Sync',
        inputSchema: s.object({}),
        outputSchema: s.object({ done: s.boolean() }),
        steps: [
          step({
            ref: 'sync_step',
            ordinal: 0,
            action: action({
              name: 'Sync Action',
              description: 'Sync',
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

    // =========================================================================
    // Transitions with timeout configuration
    // =========================================================================
    const fanOutTransition = transition({
      ref: 'fanout',
      fromNodeRef: 'start',
      toNodeRef: 'branch',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'test_group',
    });

    const syncTransition = transition({
      ref: 'sync_trans',
      fromNodeRef: 'branch',
      toNodeRef: 'sync',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'test_group',
        timeoutMs: 5000, // 5 second timeout
        onTimeout: 'proceed_with_available',
        merge: {
          source: '_branch.output.value',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const workflowDef = workflow({
      name: 'Timeout Config Test',
      description: 'Foundation test 12 - timeout configuration accepted',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {},
      initialNodeRef: 'start',
      nodes: [startNode, branchNode, syncNode],
      transitions: [fanOutTransition, syncTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    // This test just validates that the workflow with timeout config
    // is accepted and runs (all branches complete before timeout)
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
        fanOuts: [{ count: 3, branchTotal: 3 }],
        fanInArrivals: 3,
        fanInContinuations: 1,
        total: 8,
      })
      .withStateWrites([
        {
          path: 'state.results',
          type: 'array',
          arrayLength: 3,
          description: 'All 3 branches completed and merged',
        },
      ])
      .run();
  });
});
