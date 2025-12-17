import { action, node, schema as s, step, task, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/kit';

/**
 * Foundation Test 01: Single Node Mock
 *
 * The simplest possible workflow: one node, one task, one step, one mock action.
 * This is the foundation upon which all other tests build.
 *
 * Workflow structure:
 *   [generate] → (complete)
 *
 * This proves:
 * 1. Workflow lifecycle: started → completed
 * 2. Token lifecycle: pending → dispatched → executing → completed
 * 3. Context initialization with input/state/output tables
 * 4. Task dispatch and result handling
 * 5. Output mapping from task → workflow context
 * 6. Completion extraction via output_mapping
 *
 * Assertion strategy:
 * - NO SEED: Mock generates random data
 * - RELATIONAL: Assert value at Point A === value at Point B
 * - STRUCTURAL: Assert token lifecycle, event counts
 * - INVARIANTS: Assert global properties that must always hold
 */

// =============================================================================
// Global Invariants - Must hold for EVERY workflow run
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertInvariants(trace: any) {
  // 1. Every token reaches terminal state
  for (const creation of trace.tokens.creations()) {
    const tokenId = creation.token_id!;
    const statuses = trace.tokens.statusTransitions(tokenId);
    const terminal = ['completed', 'failed', 'cancelled', 'timed_out'];
    expect(
      terminal,
      `Token ${tokenId} did not reach terminal state. Statuses: ${statuses.join(' → ')}`,
    ).toContain(statuses.at(-1));
  }

  // 2. Sequences are unique and positive (delivery order may differ from emission order)
  const sequences = trace.all().map((e: { sequence: number }) => e.sequence);
  expect(
    sequences.every((seq: number) => seq > 0),
    'All sequences must be positive',
  ).toBe(true);
  expect(new Set(sequences).size, 'Sequences must be unique').toBe(sequences.length);

  // 3. Every non-root token has a parent that was created
  const createdIds = new Set(trace.tokens.creations().map((c: { token_id: string }) => c.token_id));
  for (const creation of trace.tokens.creations()) {
    if (creation.payload.parent_token_id) {
      expect(
        createdIds,
        `Token ${creation.token_id} has parent ${creation.payload.parent_token_id} that was not created`,
      ).toContain(creation.payload.parent_token_id);
    }
  }
}

// =============================================================================
// Test
// =============================================================================

describe('Foundation: 01 - Single Node Mock', () => {
  it('executes single node workflow with correct lifecycle and data flow', async () => {
    // =========================================================================
    // Schemas - Simple object with one field
    // =========================================================================
    const inputSchema = s.object({});

    // Mock output schema - NO SEED means random value each run
    const mockOutputSchema = s.object(
      {
        code: s.string({ minLength: 6, maxLength: 6 }),
      },
      { required: ['code'] },
    );

    const workflowOutputSchema = s.object(
      {
        code: s.string(),
      },
      { required: ['code'] },
    );

    // =========================================================================
    // Single Node - Generates random code
    // =========================================================================
    const generateAction = action({
      name: 'Generate Code',
      description: 'Generates a random 6-character code',
      kind: 'mock',
      implementation: {
        schema: mockOutputSchema,
        // NO SEED - random value each run for relational assertions
      },
    });

    const generateStep = step({
      ref: 'generate_step',
      ordinal: 0,
      action: generateAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.code': '$.code',
      },
    });

    const generateTask = task({
      name: 'Generate Task',
      description: 'Generates random code',
      input_schema: s.object({}),
      output_schema: mockOutputSchema,
      steps: [generateStep],
    });

    const generateNode = node({
      ref: 'generate',
      name: 'Generate',
      task: generateTask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.code': '$.code',
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(
      workflow({
        name: 'Single Node Mock Test',
        description: 'Foundation test 01 - single node lifecycle',
        input_schema: inputSchema,
        output_schema: workflowOutputSchema,
        output_mapping: {
          code: '$.output.code',
        },
        initial_node_ref: 'generate',
        nodes: [generateNode],
        transitions: [],
      }),
      {}, // empty input
    );

    const { trace } = result;

    // =========================================================================
    // INVARIANTS - Must always hold
    // =========================================================================
    assertInvariants(trace);
    console.log('  ✓ Global invariants hold');

    // =========================================================================
    // STRUCTURAL - Workflow lifecycle
    // =========================================================================

    // 1. Workflow completed
    expect(result.status).toBe('completed');
    console.log('  ✓ Workflow completed');

    // 2. Exactly one token created (root token)
    const tokenCreations = trace.tokens.creations();
    expect(tokenCreations).toHaveLength(1);
    console.log('  ✓ Single token created');

    // 3. Root token has correct lineage
    const rootToken = tokenCreations[0];
    expect(rootToken.payload.parent_token_id).toBeNull();
    expect(rootToken.payload.branch_index).toBe(0);
    expect(rootToken.payload.branch_total).toBe(1);
    expect(rootToken.payload.fan_out_transition_id).toBeNull();
    // node_id is a resolved database ID (ULID), not the ref
    expect(rootToken.node_id).toBeDefined();
    expect(typeof rootToken.node_id).toBe('string');
    console.log('  ✓ Root token has correct lineage');

    // 4. Token lifecycle is correct
    // Spec: tokens must transition through dispatched state for observability
    // This distinguishes "coordinator slow" from "executor slow/dead"
    const tokenId = rootToken.token_id!;
    const statuses = trace.tokens.statusTransitions(tokenId);
    expect(statuses).toEqual(['pending', 'dispatched', 'executing', 'completed']);
    console.log('  ✓ Token lifecycle: pending → dispatched → executing → completed');

    // =========================================================================
    // STRUCTURAL - Context lifecycle
    // =========================================================================

    // 5. Context initialized with tables
    // Table names use context_ prefix. State table only created if state schema exists.
    const contextInit = trace.context.initialize();
    expect(contextInit).toBeDefined();
    expect(contextInit!.payload.tables_created).toContain('context_input');
    expect(contextInit!.payload.tables_created).toContain('context_output');
    // No state table because our input/output schemas are empty objects with no state_schema
    console.log('  ✓ Context tables initialized');

    // =========================================================================
    // STRUCTURAL - Routing decisions
    // =========================================================================

    // 6. Routing started and completed with no transitions
    const routingStarts = trace.routing.starts();
    expect(routingStarts).toHaveLength(1);

    const routingCompletions = trace.routing.completions();
    expect(routingCompletions).toHaveLength(1);
    expect(routingCompletions[0].payload.decisions).toEqual([]);
    console.log('  ✓ Routing completed with no transitions');

    // =========================================================================
    // STRUCTURAL - Completion
    // =========================================================================

    // 7. Completion extracted final output
    const completionStart = trace.completion.start();
    expect(completionStart).toBeDefined();
    expect(completionStart!.payload.output_mapping).toBeDefined();

    const completionComplete = trace.completion.complete();
    expect(completionComplete).toBeDefined();
    console.log('  ✓ Completion extracted final output');

    // =========================================================================
    // RELATIONAL - Data flow verification
    // =========================================================================

    // 8. Value written to context.output.code === final workflow output
    const outputWrite = trace.context.setFieldAt('output.code');
    expect(outputWrite).toBeDefined();
    const writtenValue = outputWrite!.payload.value;

    const finalOutput = completionComplete!.payload.final_output as { code: string };
    expect(finalOutput.code).toBe(writtenValue);
    console.log(`  ✓ Data flow verified: written value "${writtenValue}" === final output`);

    // 9. Final output conforms to schema (string of length 6)
    expect(typeof finalOutput.code).toBe('string');
    expect(finalOutput.code.length).toBe(6);
    console.log('  ✓ Output conforms to schema constraints');

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n✅ Foundation Test 01 PASSED');
    console.log(`   Generated code: ${finalOutput.code}`);
    console.log(`   Token: ${tokenId}`);
    console.log(`   Trace events: ${trace.all().length}`);

    await cleanup();
  });
});
