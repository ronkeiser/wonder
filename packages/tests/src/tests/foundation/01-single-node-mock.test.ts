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
    // CAUSAL ORDERING - Events must occur in correct sequence
    // =========================================================================

    // 10. Verify causal ordering via sequence numbers
    const contextInitSeq = contextInit!.sequence;
    const tokenCreatedSeq = rootToken.sequence;
    const dispatchedEvent = trace.tokens.statusUpdate(tokenId, 'dispatched');
    const executingEvent = trace.tokens.statusUpdate(tokenId, 'executing');
    const completedEvent = trace.tokens.statusUpdate(tokenId, 'completed');
    const routingStartSeq = routingStarts[0].sequence;
    const completionCompleteSeq = completionComplete!.sequence;

    expect(dispatchedEvent).toBeDefined();
    expect(executingEvent).toBeDefined();
    expect(completedEvent).toBeDefined();

    // Context init before token creation
    expect(contextInitSeq).toBeLessThan(tokenCreatedSeq);
    // Token created before dispatched
    expect(tokenCreatedSeq).toBeLessThan(dispatchedEvent!.sequence);
    // Dispatched before executing (executor acknowledged)
    expect(dispatchedEvent!.sequence).toBeLessThan(executingEvent!.sequence);
    // Executing before completed
    expect(executingEvent!.sequence).toBeLessThan(completedEvent!.sequence);
    // Completed before routing (routing happens after task result)
    expect(completedEvent!.sequence).toBeLessThan(routingStartSeq);
    // Routing before completion extraction
    expect(routingStartSeq).toBeLessThan(completionCompleteSeq);
    console.log('  ✓ Causal ordering verified');

    // =========================================================================
    // EXACT EVENT COUNTS - No spurious events
    // =========================================================================

    // 11. Assert exact event counts (no unexpected events)
    expect(trace.tokens.creations()).toHaveLength(1);
    expect(trace.tokens.statusUpdates()).toHaveLength(3); // dispatched, executing, completed
    expect(trace.routing.starts()).toHaveLength(1);
    expect(trace.routing.completions()).toHaveLength(1);
    expect(trace.context.validates()).toHaveLength(1); // input validation
    console.log('  ✓ Exact event counts verified');

    // =========================================================================
    // NEGATIVE ASSERTIONS - What should NOT happen
    // =========================================================================

    // 12. No fan-out/synchronization events
    expect(trace.sync.all()).toHaveLength(0);
    console.log('  ✓ No synchronization events (expected for linear workflow)');

    // 13. No branch table operations
    expect(trace.branches.creates()).toHaveLength(0);
    expect(trace.branches.writes()).toHaveLength(0);
    expect(trace.branches.merges()).toHaveLength(0);
    console.log('  ✓ No branch table operations (expected for linear workflow)');

    // 14. No error events
    expect(trace.errors.all()).toHaveLength(0);
    console.log('  ✓ No error events');

    // =========================================================================
    // INPUT VALIDATION
    // =========================================================================

    // 15. Input was validated before being stored
    const inputValidation = trace.context.validateAt('input');
    expect(inputValidation).toBeDefined();
    expect(inputValidation!.payload.valid).toBe(true);
    expect(inputValidation!.payload.error_count).toBe(0);
    console.log('  ✓ Input validation passed');

    // =========================================================================
    // DISPATCH VERIFICATION
    // =========================================================================

    // 16. Verify task was dispatched with correct payload
    const taskDispatch = trace.dispatch.taskDispatch(tokenId);
    expect(taskDispatch).toBeDefined();
    expect(taskDispatch!.payload.task_input).toEqual({}); // empty input mapping
    console.log('  ✓ Task dispatch verified');

    // =========================================================================
    // EVENT MANIFEST - Critical events that MUST exist
    // =========================================================================

    // 17. Verify critical event types exist with expected counts
    // This catches missing events without being too fragile to internal changes
    const criticalEvents = {
      // Context operations
      'operation.context.initialized': 1,
      'operation.context.validate': 1,
      'operation.context.section_replaced': 1, // input stored
      'operation.context.field_set': 1, // output.code written

      // Token operations
      'operation.tokens.created': 1,
      'operation.tokens.status_updated': 3, // dispatched, executing, completed

      // Routing
      'decision.routing.start': 1,
      'decision.routing.complete': 1,

      // Completion
      'decision.completion.start': 1,
      'decision.completion.complete': 1,

      // Dispatch
      'dispatch.task.input_mapping.context': 1,
      'dispatch.task.input_mapping.applied': 1,
    };

    for (const [eventType, expectedCount] of Object.entries(criticalEvents)) {
      const actual = trace.byType(eventType).length;
      expect(actual, `Expected ${expectedCount} events of type '${eventType}', got ${actual}`).toBe(
        expectedCount,
      );
    }
    console.log('  ✓ Critical event manifest verified');

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
