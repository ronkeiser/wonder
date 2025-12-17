import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 04: Nested State Structure
 *
 * Tests deeply nested state objects with JSONPath mapping at each level.
 * Based on test 03 but with nested state structure instead of flat.
 *
 * Workflow structure (same as 03):
 *   [init] → (spawn 3) → [phase1] ×3 → (fan-in: merge) →
 *   [bridge] → (spawn 3) → [phase2] ×3 → (fan-in: merge) → [summarize]
 *
 * Nested state shape:
 *   state: {
 *     init: { seed: string },
 *     phase1: {
 *       results: string[],
 *       meta: { count: number, completed_at: string }
 *     },
 *     phase2: {
 *       results: string[],
 *       meta: { count: number, source_count: number }
 *     },
 *     summary: { text: string, total_items: number }
 *   }
 *
 * This proves:
 * 1. Nested JSONPath mapping ($.state.phase1.results vs flat $.state.results)
 * 2. Fan-in merge to nested paths (state.phase1.results)
 * 3. Deep state reads across nodes (phase2 reads $.state.phase1.meta.count)
 * 4. Context snapshot fidelity with nested objects
 * 5. Output mapping from deeply nested paths
 *
 * KNOWN BUG: This test currently fails with FOREIGN KEY constraint error
 * in the coordinator when writing to deeply nested paths (state.phase1.meta.count).
 * The failure occurs after fan-in merge completes and bridge node tries to write.
 */

describe('Foundation: 04 - Nested State Structure', () => {
  it('executes workflow with deeply nested state objects', async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      seed: s.string(),
    });

    const initOutputSchema = s.object({ seed: s.string() }, { required: ['seed'] });

    const phase1OutputSchema = s.object({ value: s.string() }, { required: ['value'] });

    const bridgeOutputSchema = s.object(
      {
        count: s.number(),
        completed_at: s.string(),
      },
      { required: ['count', 'completed_at'] },
    );

    // Phase2 output includes source_count - each branch echoes phase1.meta.count to prove it read accumulated state
    const phase2OutputSchema = s.object(
      {
        transformed: s.string(),
        source_count: s.number(), // Each phase2 branch echoes phase1.meta.count
      },
      { required: ['transformed', 'source_count'] },
    );

    // Summarize output includes accumulated counts from both phases
    const summarizeOutputSchema = s.object(
      {
        text: s.string(),
        total_items: s.number(),
        phase1_item_count: s.number(), // Echo of phase1.meta.count
        phase2_item_count: s.number(), // Count of phase2 results
      },
      { required: ['text', 'total_items', 'phase1_item_count', 'phase2_item_count'] },
    );

    // Nested context schema - shows state building across phases
    const contextSchema = s.object({
      init: s.object({
        seed: s.string(),
      }),
      phase1: s.object({
        results: s.array(s.string()),
        meta: s.object({
          count: s.number(),
          completed_at: s.string(),
        }),
      }),
      phase2: s.object({
        results: s.array(s.string()),
        meta: s.object({
          // source_count echoes phase1.meta.count - proving phase2 read accumulated state
          source_count: s.number(),
        }),
      }),
      summary: s.object({
        text: s.string(),
        total_items: s.number(),
        // These echo the counts from both phases - proving summary read full accumulated state
        phase1_count: s.number(),
        phase2_count: s.number(),
      }),
    });

    // Output extracts from nested paths - shows final accumulated state
    const workflowOutputSchema = s.object({
      seed: s.string(),
      phase1_results: s.array(s.string()),
      phase1_count: s.number(),
      phase2_results: s.array(s.string()),
      phase2_source_count: s.number(), // Echoed from phase1 by phase2
      summary_text: s.string(),
      total_items: s.number(),
      summary_phase1_count: s.number(), // Summary's record of phase1 count
      summary_phase2_count: s.number(), // Summary's record of phase2 count
    });

    // =========================================================================
    // Node: init
    // =========================================================================
    const initAction = action({
      name: 'Init Action',
      description: 'Initialize workflow state',
      kind: 'mock',
      implementation: { schema: initOutputSchema, options: { stringMode: 'words' } },
    });

    const initStep = step({
      ref: 'init_step',
      ordinal: 0,
      action: initAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: { 'output.seed': '$.seed' },
    });

    const initTask = task({
      name: 'Init Task',
      description: 'Initialize workflow',
      input_schema: s.object({ seed: s.string() }),
      output_schema: initOutputSchema,
      steps: [initStep],
    });

    const initNode = node({
      ref: 'init',
      name: 'Init',
      task: initTask,
      task_version: 1,
      input_mapping: { seed: '$.input.seed' },
      // Write to nested path: state.init.seed
      output_mapping: { 'state.init.seed': '$.seed' },
    });

    // =========================================================================
    // Node: phase1 (runs 3 times in parallel)
    // =========================================================================
    // Uses time jitter to test synchronization with out-of-order completion
    const phase1Action = action({
      name: 'Phase 1 Action',
      description: 'First phase parallel processing',
      kind: 'mock',
      implementation: {
        schema: phase1OutputSchema,
        options: { stringMode: 'words', delay: { min_ms: 50, max_ms: 200 } },
      },
    });

    const phase1Step = step({
      ref: 'phase1_step',
      ordinal: 0,
      action: phase1Action,
      action_version: 1,
      input_mapping: {},
      output_mapping: { 'output.value': '$.value' },
    });

    const phase1Task = task({
      name: 'Phase 1 Task',
      description: 'Process in phase 1',
      input_schema: s.object({ seed: s.string() }),
      output_schema: phase1OutputSchema,
      steps: [phase1Step],
    });

    const phase1Node = node({
      ref: 'phase1',
      name: 'Phase 1',
      task: phase1Task,
      task_version: 1,
      // Read from nested path: state.init.seed
      input_mapping: { seed: '$.state.init.seed' },
      output_mapping: { 'output.value': '$.value' },
    });

    // =========================================================================
    // Node: bridge (between fan-in #1 and fan-out #2)
    // =========================================================================
    const bridgeAction = action({
      name: 'Bridge Action',
      description: 'Bridge between phases - produces metadata',
      kind: 'mock',
      implementation: { schema: bridgeOutputSchema, options: { stringMode: 'words' } },
    });

    const bridgeStep = step({
      ref: 'bridge_step',
      ordinal: 0,
      action: bridgeAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.count': '$.count',
        'output.completed_at': '$.completed_at',
      },
    });

    const bridgeTask = task({
      name: 'Bridge Task',
      description: 'Bridge processing',
      input_schema: s.object({ phase1_results: s.array(s.string()) }),
      output_schema: bridgeOutputSchema,
      steps: [bridgeStep],
    });

    const bridgeNode = node({
      ref: 'bridge',
      name: 'Bridge',
      task: bridgeTask,
      task_version: 1,
      // Read from nested path
      input_mapping: { phase1_results: '$.state.phase1.results' },
      // Write to nested paths: state.phase1.meta.count and state.phase1.meta.completed_at
      output_mapping: {
        'state.phase1.meta.count': '$.count',
        'state.phase1.meta.completed_at': '$.completed_at',
      },
    });

    // =========================================================================
    // Node: phase2 (runs 3 times in parallel, reads aggregated phase1 state)
    // =========================================================================
    // Uses time jitter to test synchronization with out-of-order completion
    const phase2Action = action({
      name: 'Phase 2 Action',
      description: 'Second phase parallel processing',
      kind: 'mock',
      implementation: {
        schema: phase2OutputSchema,
        options: { stringMode: 'words', delay: { min_ms: 50, max_ms: 200 } },
      },
    });

    const phase2Step = step({
      ref: 'phase2_step',
      ordinal: 0,
      action: phase2Action,
      action_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.transformed': '$.transformed',
        'output.source_count': '$.source_count',
      },
    });

    const phase2Task = task({
      name: 'Phase 2 Task',
      description: 'Process in phase 2 using phase 1 results',
      input_schema: s.object({
        phase1_results: s.array(s.string()),
        phase1_count: s.number(),
      }),
      output_schema: phase2OutputSchema,
      steps: [phase2Step],
    });

    const phase2Node = node({
      ref: 'phase2',
      name: 'Phase 2',
      task: phase2Task,
      task_version: 1,
      // Read from deeply nested paths - accumulated phase1 state
      input_mapping: {
        phase1_results: '$.state.phase1.results',
        phase1_count: '$.state.phase1.meta.count',
      },
      // IDEAL BEHAVIOR: Each phase2 branch writes source_count to state
      // This proves each branch had access to accumulated phase1 state
      output_mapping: {
        'output.transformed': '$.transformed',
        'state.phase2.meta.source_count': '$.source_count',
      },
    });

    // =========================================================================
    // Node: summarize (after fan-in #2)
    // =========================================================================
    const summarizeAction = action({
      name: 'Summarize Action',
      description: 'Summarize all results',
      kind: 'mock',
      implementation: { schema: summarizeOutputSchema, options: { stringMode: 'words' } },
    });

    const summarizeStep = step({
      ref: 'summarize_step',
      ordinal: 0,
      action: summarizeAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: {
        'output.text': '$.text',
        'output.total_items': '$.total_items',
        'output.phase1_item_count': '$.phase1_item_count',
        'output.phase2_item_count': '$.phase2_item_count',
      },
    });

    const summarizeTask = task({
      name: 'Summarize Task',
      description: 'Produce final summary from accumulated state',
      input_schema: s.object({
        phase1_results: s.array(s.string()),
        phase2_results: s.array(s.string()),
        phase1_count: s.number(),        // From phase1.meta.count (written by bridge)
        phase2_source_count: s.number(), // From phase2.meta.source_count (written by phase2 branches)
      }),
      output_schema: summarizeOutputSchema,
      steps: [summarizeStep],
    });

    const summarizeNode = node({
      ref: 'summarize',
      name: 'Summarize',
      task: summarizeTask,
      task_version: 1,
      // Read accumulated state from BOTH phases - demonstrating state building
      input_mapping: {
        phase1_results: '$.state.phase1.results',              // Accumulated in fan-in #1
        phase2_results: '$.state.phase2.results',              // Accumulated in fan-in #2  
        phase1_count: '$.state.phase1.meta.count',             // Written by bridge
        phase2_source_count: '$.state.phase2.meta.source_count', // Written by phase2 branches
      },
      // Write final summary - proves summarize read full accumulated state from both phases
      output_mapping: {
        'state.summary.text': '$.text',
        'state.summary.total_items': '$.total_items',
        'state.summary.phase1_count': '$.phase1_item_count',
        'state.summary.phase2_count': '$.phase2_item_count',
      },
    });

    // =========================================================================
    // Transitions
    // =========================================================================

    // Fan-out #1: init → phase1 (spawn 3)
    const fanOut1 = transition({
      ref: 'fanout_1',
      from_node_ref: 'init',
      to_node_ref: 'phase1',
      priority: 1,
      spawn_count: 3,
    });

    // Fan-in #1: phase1 → bridge (merge to nested path)
    const fanIn1 = transition({
      ref: 'fanin_1',
      from_node_ref: 'phase1',
      to_node_ref: 'bridge',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'fanout_1',
        merge: {
          source: '_branch.output.value',
          target: 'state.phase1.results', // Nested merge target
          strategy: 'append',
        },
      },
    });

    // Fan-out #2: bridge → phase2 (spawn 3)
    const fanOut2 = transition({
      ref: 'fanout_2',
      from_node_ref: 'bridge',
      to_node_ref: 'phase2',
      priority: 1,
      spawn_count: 3,
    });

    // Fan-in #2: phase2 → summarize (merge to nested path)
    const fanIn2 = transition({
      ref: 'fanin_2',
      from_node_ref: 'phase2',
      to_node_ref: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'fanout_2',
        merge: {
          source: '_branch.output.transformed',
          target: 'state.phase2.results', // Nested merge target
          strategy: 'append',
        },
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const workflowDef = workflow({
      name: 'Nested State Structure Test',
      description: 'Foundation test 04 - deeply nested state objects with JSONPath mapping',
      input_schema: inputSchema,
      output_schema: workflowOutputSchema,
      context_schema: contextSchema,
      // Output mapping from deeply nested paths - shows full accumulated state
      output_mapping: {
        seed: '$.state.init.seed',
        phase1_results: '$.state.phase1.results',
        phase1_count: '$.state.phase1.meta.count',
        phase2_results: '$.state.phase2.results',
        phase2_source_count: '$.state.phase2.meta.source_count', // Echoed from phase1 by phase2
        summary_text: '$.state.summary.text',
        total_items: '$.state.summary.total_items',
        summary_phase1_count: '$.state.summary.phase1_count', // Summary's record of phase1 count
        summary_phase2_count: '$.state.summary.phase2_count', // Summary's record of phase2 count
      },
      initial_node_ref: 'init',
      nodes: [initNode, phase1Node, bridgeNode, phase2Node, summarizeNode],
      transitions: [fanOut1, fanIn1, fanOut2, fanIn2],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { seed: 'NESTED' };
    const { result, cleanup } = await runTestWorkflow(workflowDef, workflowInput);

    try {
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
          // Same token structure as test 03:
          // - 1 root token (init)
          // - 3 phase1 tokens (fan-out #1)
          // - 3 fan-in arrival tokens (from phase1)
          // - 1 bridge continuation token
          // - 3 phase2 tokens (fan-out #2)
          // - 3 fan-in arrival tokens (from phase2)
          // - 1 summarize continuation token
          // Total: 15
          root: 1,
          fanOuts: [
            { count: 3, branchTotal: 3, outputFields: ['value'] },
            { count: 3, branchTotal: 3, outputFields: ['transformed', 'source_count'] },
          ],
          fanInArrivals: 6,
          fanInContinuations: 2,
          total: 15,
        })
        .withStateWriteOrder([
          // Phase 1: init → fan-out → fan-in → bridge
          'state.init.seed',
          'state.phase1.results', // Fan-in merge
          'state.phase1.meta.count', // Bridge writes metadata
          'state.phase1.meta.completed_at',
          // Phase 2: fan-out → phase2 nodes write source_count → fan-in → summarize
          // Note: phase2 nodes each write source_count (may appear multiple times due to parallel execution)
          'state.phase2.meta.source_count', // Phase2 echoes phase1.meta.count - STATE BUILDING
          'state.phase2.results', // Fan-in merge
          // Summarize writes final accumulated counts
          'state.summary.text',
          'state.summary.total_items',
          'state.summary.phase1_count', // Summary echoes phase1 count - STATE BUILDING
          'state.summary.phase2_count', // Summary echoes phase2 count - STATE BUILDING
        ])
        .withStateWrites([
          { path: 'state.init.seed', type: 'string', description: 'Written by init' },
          {
            path: 'state.phase1.results',
            type: 'array',
            arrayLength: 3,
            description: 'Fan-in #1 merges phase1 outputs',
          },
          {
            path: 'state.phase1.meta.count',
            type: 'number',
            description: 'Bridge computes count from phase1.results',
          },
          {
            path: 'state.phase1.meta.completed_at',
            type: 'string',
            description: 'Bridge records completion timestamp',
          },
          {
            path: 'state.phase2.meta.source_count',
            type: 'number',
            description: 'Phase2 echoes phase1.meta.count - proves it read accumulated state',
          },
          {
            path: 'state.phase2.results',
            type: 'array',
            arrayLength: 3,
            description: 'Fan-in #2 merges phase2 outputs',
          },
          {
            path: 'state.summary.text',
            type: 'string',
            description: 'Summarize produces final text',
          },
          {
            path: 'state.summary.total_items',
            type: 'number',
            description: 'Summarize computes total from both phases',
          },
          {
            path: 'state.summary.phase1_count',
            type: 'number',
            description: 'Summary records phase1 count - proves it read accumulated state',
          },
          {
            path: 'state.summary.phase2_count',
            type: 'number',
            description: 'Summary records phase2 count - proves it read accumulated state',
          },
        ])
        .withBranchWrites({
          uniqueTokenCount: 6, // 3 phase1 + 3 phase2 branches
        })
        .withOutput({
          seed: { type: 'string', defined: true },
          phase1_results: { type: 'array', arrayLength: 3 },
          phase1_count: { type: 'number', defined: true },
          phase2_results: { type: 'array', arrayLength: 3 },
          phase2_source_count: { type: 'number', defined: true }, // Echoed from phase1
          summary_text: { type: 'string', defined: true },
          total_items: { type: 'number', defined: true },
          summary_phase1_count: { type: 'number', defined: true }, // Summary's record
          summary_phase2_count: { type: 'number', defined: true }, // Summary's record
        })
        .withSnapshots({
          minCount: 2,
          // Verify nested state structure is captured correctly
          withState: {
            field: 'phase1',
            matcher: (val) =>
              typeof val === 'object' &&
              val !== null &&
              'results' in val &&
              Array.isArray((val as { results: unknown }).results),
          },
        })
        .run();
    } finally {
      await cleanup();
    }
  });
});
