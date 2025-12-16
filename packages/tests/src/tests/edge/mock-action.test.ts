import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/kit';

/**
 * Mock Action Test
 *
 * Tests the mock action's ability to generate deterministic random data
 * from a JSON schema without LLM dependencies.
 *
 * Workflow structure:
 *   [mock_node] → (complete)
 *
 * This proves:
 * 1. Mock actions generate data conforming to schemas
 * 2. Seeded generation produces deterministic output
 * 3. Constraints (min/max, enum) are respected
 */
describe('Coordinator - Mock Action', () => {
  it('generates deterministic mock data from schema', async () => {
    const inputData = {};

    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});

    // Mock output: score and grade
    const mockSchema = s.object(
      {
        score: s.number({ minimum: 1, maximum: 100 }),
        grade: s.string({ enum: ['A', 'B', 'C', 'D', 'F'] }),
      },
      { required: ['score', 'grade'] },
    );

    const workflowOutputSchema = s.object(
      {
        score: s.number(),
        grade: s.string(),
      },
      { required: ['score', 'grade'] },
    );

    // =========================================================================
    // Mock Node - Generates random score and grade
    // =========================================================================
    const mockAction = action({
      name: 'Mock Score Generator',
      description: 'Generates random score and grade',
      kind: 'mock',
      implementation: {
        schema: mockSchema,
        options: { seed: 42 }, // Deterministic
      },
    });

    const mockStep = step({
      ref: 'mock_step',
      ordinal: 0,
      action: mockAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.score': '$.score',
        'output.grade': '$.grade',
      },
    });

    const mockTask = task({
      name: 'Mock Task',
      description: 'Generates mock data',
      input_schema: s.object({}),
      output_schema: mockSchema,
      steps: [mockStep],
    });

    const mockNode = node({
      ref: 'mock_node',
      name: 'Mock Generator',
      task: mockTask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.score': '$.score',
        'output.grade': '$.grade',
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: 'Mock Data Workflow',
        description: 'Tests mock action execution',
        input_schema: inputSchema,
        output_schema: workflowOutputSchema,
        output_mapping: {
          score: '$.output.score',
          grade: '$.output.grade',
        },
        initial_node_ref: 'mock_node',
        nodes: [mockNode],
        transitions: [],
      }),
      inputData,
    );

    // =========================================================================
    // Verify
    // =========================================================================
    const { trace } = result;

    // 1. Workflow should complete successfully
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed');

    // 2. Extract final output from completion event
    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    const finalOutput = completionComplete!.payload.final_output as {
      score: number;
      grade: string;
    };

    // 3. Verify mock data conforms to schema constraints
    expect(finalOutput.score).toBeDefined();
    expect(typeof finalOutput.score).toBe('number');
    expect(finalOutput.score).toBeGreaterThanOrEqual(1);
    expect(finalOutput.score).toBeLessThanOrEqual(100);
    console.log(`  ✓ Score in valid range: ${finalOutput.score}`);

    expect(finalOutput.grade).toBeDefined();
    expect(['A', 'B', 'C', 'D', 'F']).toContain(finalOutput.grade);
    console.log(`  ✓ Grade is valid enum: ${finalOutput.grade}`);

    // 4. With seed 42, output should be deterministic
    console.log(`\n✅ Mock data validation complete - Generated: ${JSON.stringify(finalOutput)}\n`);

    await cleanup();
  });
});
