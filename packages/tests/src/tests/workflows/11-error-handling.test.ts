import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 11: Error Handling and Workflow Failure
 *
 * Tests the error handling path through the coordinator and executor.
 * When a task fails, the token should be marked as 'failed' and the
 * workflow should transition to a 'failed' state.
 *
 * ERROR FLOW:
 * 1. Action returns success: false → StepFailureError thrown
 * 2. Executor returns TaskResult with success: false, error details
 * 3. Coordinator receives error, calls processTaskError()
 * 4. Token status updated to 'failed'
 * 5. failWorkflow() called, emits workflow.failed event
 * 6. Workflow run status updated to 'failed' in resources
 *
 * WHAT THIS TEST VALIDATES:
 * 1. Task failures propagate correctly through the system
 * 2. Token and workflow status are updated appropriately
 * 3. Error details (message, type, retryable) are preserved
 * 4. Workflow fails immediately on first error (no retry in current impl)
 */

describe('Foundation: 11 - Error Handling and Workflow Failure', () => {
  /**
   * Test: Simple task failure
   *
   * A single-node workflow where the task fails immediately.
   * Mock action without schema triggers INVALID_IMPLEMENTATION error.
   */
  it('task failure leads to workflow failure', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const outputSchema = s.object({
      result: s.string(),
    });

    const contextSchema = s.object({});
    const workflowOutputSchema = s.object({});

    // =========================================================================
    // Node: failing node (mock action without schema = will fail)
    // =========================================================================
    const failingNode = node({
      ref: 'failing',
      name: 'Failing Node',
      task: task({
        name: 'Failing Task',
        description: 'A task that will fail',
        inputSchema: s.object({}),
        outputSchema: outputSchema,
        steps: [
          step({
            ref: 'failing_step',
            ordinal: 0,
            action: action({
              name: 'Broken Action',
              description: 'Mock action without schema - will fail',
              kind: 'mock',
              // NO schema provided - this causes mock action to return success: false
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.result': 'result.result' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const workflowDef = workflow({
      name: 'Simple Failure Test',
      description: 'Foundation test 11 - task failure leads to workflow failure',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {},
      initialNodeRef: 'failing',
      nodes: [failingNode],
      transitions: [],
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
    // Even failed workflows should have valid trace structure
    assertInvariants(trace);

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .failed({
        message: 'Mock action requires schema in implementation',
        retryable: false,
      })
      .withTokens({
        root: 1,
        total: 1,
      })
      .run();
  });

  /**
   * Test: Failure after successful node
   *
   * A two-node workflow where the first node succeeds but the second fails.
   * Validates that partial execution state is preserved.
   */
  it('failure after successful execution preserves state', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const successOutputSchema = s.object(
      { value: s.number() },
      { required: ['value'] },
    );

    const failOutputSchema = s.object(
      { result: s.string() },
      { required: ['result'] },
    );

    const contextSchema = s.object({
      value: s.number(),
    });
    const workflowOutputSchema = s.object({});

    // =========================================================================
    // Node: success node (works fine)
    // =========================================================================
    const successNode = node({
      ref: 'success',
      name: 'Success Node',
      task: task({
        name: 'Success Task',
        description: 'A task that succeeds',
        inputSchema: s.object({}),
        outputSchema: successOutputSchema,
        steps: [
          step({
            ref: 'success_step',
            ordinal: 0,
            action: action({
              name: 'Working Action',
              description: 'Mock action with schema - will succeed',
              kind: 'mock',
              implementation: {
                schema: successOutputSchema,
              },
            }),
            inputMapping: {},
            outputMapping: { 'output.value': 'result.value' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: { 'state.value': 'result.value' },
    });

    // =========================================================================
    // Node: failing node (will fail)
    // =========================================================================
    const failingNode = node({
      ref: 'failing',
      name: 'Failing Node',
      task: task({
        name: 'Failing Task',
        description: 'A task that will fail',
        inputSchema: s.object({ value: s.number() }),
        outputSchema: failOutputSchema,
        steps: [
          step({
            ref: 'failing_step',
            ordinal: 0,
            action: action({
              name: 'Broken Action',
              description: 'Mock action without schema - will fail',
              kind: 'mock',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.result': 'result.result' },
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
    const toFailingTransition = transition({
      ref: 'to_failing',
      fromNodeRef: 'success',
      toNodeRef: 'failing',
      priority: 1,
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const workflowDef = workflow({
      name: 'Partial Success Then Failure',
      description: 'Foundation test 11 - failure after success',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {},
      initialNodeRef: 'success',
      nodes: [successNode, failingNode],
      transitions: [toFailingTransition],
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
      .failed({
        message: 'Mock action requires schema in implementation',
      })
      .withTokens({
        root: 2, // success token + failing token
        total: 2,
      })
      .withStateWrites([
        {
          path: 'state.value',
          type: 'number',
          description: 'Value written by success node before failure',
        },
      ])
      .run();
  });

  /**
   * Test: Failure in fan-out branch
   *
   * When one branch of a fan-out fails, the entire workflow should fail.
   * Other branches may continue executing but the workflow will not complete.
   */
  it('failure in fan-out branch fails workflow', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const startOutputSchema = s.object(
      { started: s.boolean() },
      { required: ['started'] },
    );

    const branchOutputSchema = s.object(
      { value: s.number() },
      { required: ['value'] },
    );

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
            outputMapping: { 'output.started': 'true' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Node: branch (first branch succeeds, second fails based on index)
    // We use a single node definition - all branches use the same task.
    // Since mock generates random data, we can't conditionally fail.
    // Instead, we create a task that always fails.
    // =========================================================================
    const branchNode = node({
      ref: 'branch',
      name: 'Branch',
      task: task({
        name: 'Branch Task',
        description: 'A branch task that will fail',
        inputSchema: s.object({}),
        outputSchema: branchOutputSchema,
        steps: [
          step({
            ref: 'branch_step',
            ordinal: 0,
            action: action({
              name: 'Failing Branch Action',
              description: 'Will fail due to missing schema',
              kind: 'mock',
              implementation: {},
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
    // Transitions
    // =========================================================================
    const fanOutTransition = transition({
      ref: 'fanout',
      fromNodeRef: 'start',
      toNodeRef: 'branch',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'branch_group',
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const workflowDef = workflow({
      name: 'Fan-out Failure Test',
      description: 'Foundation test 11 - failure in fan-out branch',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {},
      initialNodeRef: 'start',
      nodes: [startNode, branchNode],
      transitions: [fanOutTransition],
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
    // Note: In a fan-out with failure, other tokens may still be in-flight
    // when the workflow fails. This is expected behavior - the workflow
    // fails immediately on first error without waiting for other branches.
    assertInvariants(trace, { allowNonTerminalTokens: true });

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    // All 3 branches will fail (since all use the same failing task)
    // The workflow fails on the first failure
    verify(trace, { input: workflowInput, definition: workflowDef, events })
      .failed({
        message: 'Mock action requires schema in implementation',
      })
      // Start token + 3 branch tokens (all spawned before any fail)
      .withTokens({
        root: 1,
        // The fan-out spawns all tokens, then they execute and fail
        fanOuts: [{ count: 3, branchTotal: 3 }],
        total: 4,
      })
      .run();
  });

  /**
   * Test: Error details are preserved
   *
   * Validates that error information flows through correctly:
   * - error.message is set
   * - error.type is 'step_failure'
   * - error.retryable is false for invalid implementation
   */
  it('preserves error details from executor', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});
    const outputSchema = s.object({ result: s.string() });
    const contextSchema = s.object({});
    const workflowOutputSchema = s.object({});

    // =========================================================================
    // Node
    // =========================================================================
    const failingNode = node({
      ref: 'failing',
      name: 'Failing Node',
      task: task({
        name: 'Failing Task',
        description: 'Task that fails with specific error',
        inputSchema: s.object({}),
        outputSchema: outputSchema,
        steps: [
          step({
            ref: 'failing_step',
            ordinal: 0,
            action: action({
              name: 'Invalid Mock',
              description: 'Mock without schema',
              kind: 'mock',
              implementation: {},
            }),
            inputMapping: {},
            outputMapping: { 'output.result': 'result.result' },
          }),
        ],
      }),
      taskVersion: 1,
      inputMapping: {},
      outputMapping: {},
    });

    // =========================================================================
    // Workflow
    // =========================================================================
    const workflowDef = workflow({
      name: 'Error Details Test',
      description: 'Foundation test 11 - error details preservation',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {},
      initialNodeRef: 'failing',
      nodes: [failingNode],
      transitions: [],
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
      .failed({
        message: 'Mock action requires schema in implementation',
        errorType: 'step_failure',
        retryable: false,
      })
      .run();
  });
});
