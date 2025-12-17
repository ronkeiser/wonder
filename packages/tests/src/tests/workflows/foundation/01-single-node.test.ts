import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/kit';

/**
 * Foundation Test 01: Single Node
 *
 * Proves the absolute minimal workflow executes correctly.
 * Every subsequent test builds on this foundation.
 *
 * Workflow structure:
 *   [start_node] → (complete)
 *
 * What this proves:
 * - Coordinator can initialize a workflow run
 * - Root token creation works
 * - Token state machine transitions correctly
 * - Executor receives and executes task
 * - Mock action generates schema-conforming data
 * - Output mapping flows: action → step → task → node → workflow
 * - Workflow completion detection works
 * - Trace events are emitted correctly
 */
describe('Foundation 01 - Single Node', () => {
  it('executes a single-node workflow with mock action', async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const outputSchema = s.object(
      {
        value: s.string(),
      },
      { required: ['value'] },
    );

    // =========================================================================
    // Mock Action - NO seed for random value (relational assertions)
    // =========================================================================
    const mockAction = action({
      name: 'Generate Value',
      description: 'Generates a random string value',
      kind: 'mock',
      implementation: {
        schema: outputSchema,
        // No seed - random value each run
        // No delay - fast execution
      },
    });

    const mockStep = step({
      ref: 'generate_step',
      ordinal: 0,
      action: mockAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.value': '$.value',
      },
    });

    const mockTask = task({
      name: 'Generate Value Task',
      description: 'Task that generates a random value',
      input_schema: s.object({}),
      output_schema: outputSchema,
      steps: [mockStep],
    });

    const startNode = node({
      ref: 'start_node',
      name: 'Start',
      task: mockTask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.value': '$.value',
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: 'Single Node Workflow',
        description: 'Foundation test: minimal workflow with one node',
        input_schema: inputSchema,
        output_schema: outputSchema,
        output_mapping: {
          value: '$.output.value',
        },
        initial_node_ref: 'start_node',
        nodes: [startNode],
        transitions: [],
      }),
      {}, // Empty input
    );

    // =========================================================================
    // Structural Assertions (Coordinator Mechanics)
    // =========================================================================
    const { trace } = result;

    // Workflow completed successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed');

    // Exactly 1 token created
    const creations = trace.tokens.creations();
    expect(creations).toHaveLength(1);
    console.log('  ✓ Exactly 1 token created');

    // Root token has correct structure
    const rootTokenEvent = creations[0];
    const rootTokenPayload = rootTokenEvent.payload;
    expect(rootTokenPayload.parent_token_id).toBeNull();
    // node_id is top-level on the event
    expect(rootTokenEvent.node_id).toBeDefined();
    expect(rootTokenPayload.branch_index).toBe(0);
    expect(rootTokenPayload.branch_total).toBe(1);
    expect(rootTokenPayload.fan_out_transition_id).toBeNull();
    console.log('  ✓ Root token structure correct (root, no parent, no fan-out)');

    // Correct state transitions - token_id is top-level
    const statuses = trace.tokens.statusTransitions(rootTokenEvent.token_id!);
    expect(statuses).toEqual(['pending', 'executing', 'completed']);
    console.log('  ✓ Token lifecycle: pending → executing → completed');

    // No routing (no transitions to evaluate)
    expect(trace.routing.matches()).toHaveLength(0);
    console.log('  ✓ No transitions matched (as expected)');

    // =========================================================================
    // Relational Assertions (Data Flow)
    // =========================================================================

    // Mock generated a value and wrote it to context
    const contextWrite = trace.context.setFieldAt('output.value');
    expect(contextWrite).toBeDefined();
    const mockOutput = contextWrite!.payload.value;
    expect(mockOutput).toBeDefined();
    expect(typeof mockOutput).toBe('string');
    console.log(`  ✓ Mock generated value: "${mockOutput}"`);

    // Final workflow output equals what was written to context
    const completionEvent = trace.completion.complete();
    expect(completionEvent).toBeDefined();
    const finalOutput = completionEvent!.payload.final_output as { value: string };
    expect(finalOutput.value).toBe(mockOutput);
    console.log('  ✓ Final output matches context write (data flowed correctly)');

    // =========================================================================
    // Global Invariants
    // =========================================================================

    // Every token reaches terminal state
    for (const creation of trace.tokens.creations()) {
      const tokenStatuses = trace.tokens.statusTransitions(creation.token_id!);
      const terminal = ['completed', 'failed', 'cancelled', 'timed_out'];
      expect(terminal).toContain(tokenStatuses.at(-1));
    }
    console.log('  ✓ All tokens reached terminal state');

    // Events have unique, positive sequence numbers
    // Note: Events may arrive out-of-order over WebSocket, but sequence numbers are monotonic at emission
    const sequences = trace.all().map((e) => e.sequence);
    expect(sequences.length).toBeGreaterThan(0);
    expect(new Set(sequences).size).toBe(sequences.length); // All unique
    expect(sequences.every((s) => s > 0)).toBe(true); // All positive
    console.log(`  ✓ ${sequences.length} events with unique sequence numbers`);

    // Every non-root token has a parent that was created (trivially true here)
    const createdIds = new Set(trace.tokens.creations().map((c) => c.token_id!));
    for (const creation of trace.tokens.creations()) {
      if (creation.payload.parent_token_id) {
        expect(createdIds).toContain(creation.payload.parent_token_id);
      }
    }
    console.log('  ✓ Parent chain valid');

    console.log('\n✅ Foundation 01 complete - Single node workflow works correctly\n');

    await cleanup();
  });
});
