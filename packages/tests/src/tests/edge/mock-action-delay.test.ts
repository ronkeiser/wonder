import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/kit';

/**
 * Mock Action Delay Test
 *
 * Tests the mock action's delay feature for performance testing.
 *
 * Workflow structure:
 *   [mock_node] → (complete)
 *
 * This proves:
 * 1. Mock actions can simulate execution delays
 * 2. Delay duration affects total workflow execution time
 * 3. Output is still generated correctly despite delay
 */
describe('Coordinator - Mock Action Delay', () => {
  it('simulates execution delay within configured boundaries', async () => {
    const inputData = {};

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    const mockSchema = s.object(
      {
        value: s.string(),
      },
      { required: ['value'] },
    );

    const workflowOutputSchema = s.object(
      {
        value: s.string(),
      },
      { required: ['value'] },
    );

    // =========================================================================
    // Mock Node with Delay - Simulates slow action (500-1000ms)
    // =========================================================================
    const mockAction = action({
      name: 'Slow Mock Action',
      description: 'Generates data with simulated delay',
      kind: 'mock',
      implementation: {
        schema: mockSchema,
        options: {
          seed: 42,
          delay: { min_ms: 500, max_ms: 1000 },
        },
      },
    });

    const mockStep = step({
      ref: 'mock_step',
      ordinal: 0,
      action: mockAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.value': '$.value',
      },
    });

    const mockTask = task({
      name: 'Mock Task',
      description: 'Generates mock data with delay',
      input_schema: s.object({}),
      output_schema: mockSchema,
      steps: [mockStep],
    });

    const mockNode = node({
      ref: 'mock_node',
      name: 'Slow Mock',
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
    const startTime = Date.now();

    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: 'Mock Delay Workflow',
        description: 'Tests mock action delay',
        input_schema: inputSchema,
        output_schema: workflowOutputSchema,
        output_mapping: {
          value: '$.output.value',
        },
        initial_node_ref: 'mock_node',
        nodes: [mockNode],
        transitions: [],
      }),
      inputData,
    );

    const duration = Date.now() - startTime;

    // =========================================================================
    // Verify
    // =========================================================================
    const { trace } = result;

    // 1. Workflow should complete successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed');

    // 2. Extract final output
    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    const finalOutput = completionComplete!.payload.final_output as {
      value: string;
    };

    // 3. Verify output is correct
    expect(finalOutput.value).toBeDefined();
    expect(typeof finalOutput.value).toBe('string');
    console.log(`  ✓ Generated value: "${finalOutput.value}"`);

    // 4. Verify delay was applied (execution should take at least min_ms)
    expect(duration).toBeGreaterThanOrEqual(500);
    console.log(`  ✓ Execution took ${duration}ms (expected >= 500ms)`);

    console.log(`\n✅ Mock delay validation complete - Delay enforced, output correct\n`);

    await cleanup();
  });
});
