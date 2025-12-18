import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 06: Explicit Fan-Out with Synchronization
 *
 * This test validates explicit fan-out (multiple distinct transitions to different nodes)
 * with synchronization and merge semantics - the same semantics supported by spawn_count-based
 * fan-out.
 *
 * The coordinator supports sibling grouping for explicit fan-out transitions. When multiple
 * transitions share the same `sibling_group` name in their synchronization config, the coordinator
 * treats tokens spawned by these transitions as siblings for fan-in coordination.
 *
 * Workflow structure:
 *   [init] → [phase1_a]
 *          → [phase1_b]  → (fan-in: sync + merge) → [bridge] → [phase2_a]
 *          → [phase1_c]                                       → [phase2_b]  → (fan-in: sync + merge) → [summarize]
 *                                                             → [phase2_c]
 *
 * This enables the exact same semantics as spawn_count, but with explicit node targets:
 * - Explicit fan-out: Multiple transitions from one node to different target nodes
 * - Sibling grouping: Transitions declare membership in a synchronization group (e.g., 'phase1_fanin')
 * - Fan-in coordination: All siblings must arrive before continuation spawns
 * - Merge strategies: Append, collect, merge_object, etc. work identically to spawn_count
 *
 * COMPARISON WITH TEST 04:
 * - Test 04: Uses spawn_count (single transition spawns 3 tokens to same node)
 * - Test 06: Uses explicit fan-out (3 transitions to 3 different nodes)
 * - Both have identical synchronization and merge behavior
 *
 * WHAT THIS TEST VALIDATES:
 * - Explicit transitions can declare sibling_group membership
 * - Coordinator recognizes explicit siblings for synchronization
 * - Fan-in waits for all siblings before continuation
 * - Merge strategies work identically to spawn_count
 * - Value flow through explicit branches
 * - Nested state structure with explicit nodes
 */

describe('Foundation: 06 - Explicit Fan-Out', () => {
  it('executes workflow with explicit parallel nodes (no spawn_count)', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      seed: s.string(),
    });

    const initOutputSchema = s.object({ seed: s.string() }, { required: ['seed'] });

    const phase1OutputSchema = s.object({ value: s.string() }, { required: ['value'] });

    // Bridge aggregates all phase1 values into an array
    const bridgeOutputSchema = s.object(
      {
        phase1_words: s.array(s.string()), // Aggregated from phase1.value_a/b/c
      },
      { required: ['phase1_words'] },
    );

    // Phase2 accumulates: inherited words + new word = grown array
    const phase2OutputSchema = s.object(
      {
        accumulated: s.array(s.string()), // inherited_words + word merged together
      },
      { required: ['accumulated'] },
    );

    // Summarize passes through ALL accumulated data to prove it received everything
    const summarizeOutputSchema = s.object(
      {
        phase1_words: s.array(s.string()),
        phase2_accumulated: s.array(s.array(s.string())), // Array of accumulated arrays
        bridge_inherited: s.array(s.string()),
      },
      { required: ['phase1_words', 'phase2_accumulated', 'bridge_inherited'] },
    );

    // Nested context schema - same as test 04 (shared merge targets)
    const contextSchema = s.object({
      init: s.object({
        seed: s.string(),
      }),
      phase1: s.object({
        results: s.array(s.string()), // Fan-in merged words from phase1 branches (3 words)
      }),
      bridge: s.object({
        phase1_words: s.array(s.string()), // Bridge's copy of phase1.results
      }),
      phase2: s.object({
        // Fan-in collects accumulated arrays preserving structure
        accumulated: s.array(s.array(s.string())),
      }),
      summary: s.object({
        phase1_words: s.array(s.string()),
        phase2_accumulated: s.array(s.array(s.string())),
        bridge_inherited: s.array(s.string()),
      }),
    });

    // Output exposes all paths for verification (same as test 04)
    const workflowOutputSchema = s.object({
      seed: s.string(),
      // From phase1 fan-in merge (3 words)
      phase1_results: s.array(s.string()),
      // From bridge passthrough
      bridge_phase1_words: s.array(s.string()),
      // From phase2 fan-in with 'collect': 3 arrays of 4 items each
      phase2_accumulated: s.array(s.array(s.string())),
      // From summarize passthrough
      summary_phase1_words: s.array(s.string()),
      summary_phase2_accumulated: s.array(s.array(s.string())),
      summary_bridge_inherited: s.array(s.string()),
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
    // Phase 1 Nodes: 3 explicit parallel nodes
    // Each writes to output.value (same as spawn_count pattern)
    // =========================================================================
    const createPhase1Node = (suffix: string) => {
      const phase1Action = action({
        name: `Phase 1 ${suffix.toUpperCase()} Action`,
        description: `First phase parallel processing - branch ${suffix}`,
        kind: 'mock',
        implementation: {
          schema: phase1OutputSchema,
          options: { stringMode: 'words', delay: { min_ms: 100, max_ms: 500 } },
        },
      });

      const phase1Step = step({
        ref: `phase1_${suffix}_step`,
        ordinal: 0,
        action: phase1Action,
        action_version: 1,
        input_mapping: {},
        output_mapping: { 'output.value': '$.value' },
      });

      const phase1Task = task({
        name: `Phase 1 ${suffix.toUpperCase()} Task`,
        description: `Process in phase 1 - branch ${suffix}`,
        input_schema: s.object({ seed: s.string() }),
        output_schema: phase1OutputSchema,
        steps: [phase1Step],
      });

      return node({
        ref: `phase1_${suffix}`,
        name: `Phase 1 ${suffix.toUpperCase()}`,
        task: phase1Task,
        task_version: 1,
        input_mapping: { seed: '$.state.init.seed' },
        // IMPORTANT: Writes to output.value (will be merged by fan-in transition)
        output_mapping: { 'output.value': '$.value' },
      });
    };

    const phase1ANode = createPhase1Node('a');
    const phase1BNode = createPhase1Node('b');
    const phase1CNode = createPhase1Node('c');

    // =========================================================================
    // Node: bridge (same as test 04 - passthrough)
    // =========================================================================
    const bridgeAction = action({
      name: 'Bridge Action',
      description: 'Passthrough - proves bridge receives aggregated phase1 results',
      kind: 'update_context',
      implementation: {},
    });

    const bridgeStep = step({
      ref: 'bridge_step',
      ordinal: 0,
      action: bridgeAction,
      action_version: 1,
      input_mapping: { phase1_words: '$.input.phase1_words' },
      output_mapping: { 'output.phase1_words': '$.phase1_words' },
    });

    const bridgeTask = task({
      name: 'Bridge Task',
      description: 'Passthrough bridge - receives and forwards phase1 results',
      input_schema: s.object({ phase1_words: s.array(s.string()) }),
      output_schema: bridgeOutputSchema,
      steps: [bridgeStep],
    });

    const bridgeNode = node({
      ref: 'bridge',
      name: 'Bridge',
      task: bridgeTask,
      task_version: 1,
      // Read from merged state (fan-in will have written here)
      input_mapping: { phase1_words: '$.state.phase1.results' },
      output_mapping: {
        'state.bridge.phase1_words': '$.phase1_words',
      },
    });

    // =========================================================================
    // Phase 2 Nodes: 3 explicit parallel nodes (instead of spawn_count: 3)
    // Each branch: generates a word, then merges it with inherited words
    // =========================================================================
    // =========================================================================
    // Phase 2 Nodes: 3 explicit parallel nodes (same pattern as test 04)
    // =========================================================================
    const createPhase2Node = (suffix: string) => {
      const phase2WordAction = action({
        name: `Phase 2 ${suffix.toUpperCase()} Word Action`,
        description: `Generates a word for branch ${suffix}`,
        kind: 'mock',
        implementation: {
          schema: s.object({ word: s.string() }, { required: ['word'] }),
          options: { stringMode: 'words', delay: { min_ms: 100, max_ms: 500 } },
        },
      });

      const phase2WordStep = step({
        ref: `phase2_${suffix}_word_step`,
        ordinal: 0,
        action: phase2WordAction,
        action_version: 1,
        input_mapping: {},
        output_mapping: { 'output.word': '$.word' },
      });

      const phase2MergeAction = action({
        name: `Phase 2 ${suffix.toUpperCase()} Merge Action`,
        description: `Merges inherited words with new word - branch ${suffix}`,
        kind: 'update_context',
        implementation: {
          merge: {
            target: 'accumulated',
            sources: ['inherited_words', 'word'],
          },
        },
      });

      const phase2MergeStep = step({
        ref: `phase2_${suffix}_merge_step`,
        ordinal: 1,
        action: phase2MergeAction,
        action_version: 1,
        input_mapping: {
          inherited_words: '$.input.inherited_words',
          word: '$.output.word',
        },
        output_mapping: {
          'output.accumulated': '$.accumulated',
        },
      });

      const phase2Task = task({
        name: `Phase 2 ${suffix.toUpperCase()} Task`,
        description: `Generates word and accumulates with inherited - branch ${suffix}`,
        input_schema: s.object({
          inherited_words: s.array(s.string()),
        }),
        output_schema: phase2OutputSchema,
        steps: [phase2WordStep, phase2MergeStep],
      });

      return node({
        ref: `phase2_${suffix}`,
        name: `Phase 2 ${suffix.toUpperCase()}`,
        task: phase2Task,
        task_version: 1,
        input_mapping: {
          inherited_words: '$.state.bridge.phase1_words',
        },
        // IMPORTANT: Writes to output.accumulated (will be collected by fan-in transition)
        output_mapping: {
          'output.accumulated': '$.accumulated',
        },
      });
    };

    const phase2ANode = createPhase2Node('a');
    const phase2BNode = createPhase2Node('b');
    const phase2CNode = createPhase2Node('c');

    // =========================================================================
    // Node: summarize (same as test 04 - passthrough)
    // =========================================================================
    const summarizeAction = action({
      name: 'Summarize Action',
      description: 'Passthrough - proves summarize receives all accumulated state',
      kind: 'update_context',
      implementation: {},
    });

    const summarizeStep = step({
      ref: 'summarize_step',
      ordinal: 0,
      action: summarizeAction,
      action_version: 1,
      input_mapping: {
        phase1_words: '$.input.phase1_words',
        phase2_accumulated: '$.input.phase2_accumulated',
        bridge_inherited: '$.input.bridge_inherited',
      },
      output_mapping: {
        'output.phase1_words': '$.phase1_words',
        'output.phase2_accumulated': '$.phase2_accumulated',
        'output.bridge_inherited': '$.bridge_inherited',
      },
    });

    const summarizeTask = task({
      name: 'Summarize Task',
      description: 'Passthrough - receives and forwards all accumulated state',
      input_schema: s.object({
        phase1_words: s.array(s.string()),
        phase2_accumulated: s.array(s.array(s.string())),
        bridge_inherited: s.array(s.string()),
      }),
      output_schema: summarizeOutputSchema,
      steps: [summarizeStep],
    });

    const summarizeNode = node({
      ref: 'summarize',
      name: 'Summarize',
      task: summarizeTask,
      task_version: 1,
      // Read from merged state (fan-in will have written here)
      input_mapping: {
        phase1_words: '$.state.phase1.results',
        phase2_accumulated: '$.state.phase2.accumulated',
        bridge_inherited: '$.state.bridge.phase1_words',
      },
      output_mapping: {
        'state.summary.phase1_words': '$.phase1_words',
        'state.summary.phase2_accumulated': '$.phase2_accumulated',
        'state.summary.bridge_inherited': '$.bridge_inherited',
      },
    });

    // =========================================================================
    // TRANSITIONS - EXPLICIT fan-out WITH synchronization (IDEAL behavior)
    // =========================================================================
    // CRITICAL SPECIFICATION:
    // Explicit fan-out should support the exact same synchronization semantics as spawn_count.
    //
    // When multiple transitions share the same sibling_group name in their synchronization
    // config, the coordinator MUST treat tokens spawned by these transitions as siblings
    // for fan-in coordination.
    //
    // This is REQUIRED behavior - not optional. If the current implementation cannot support
    // this, it's a bug/limitation that needs to be fixed.
    // =========================================================================

    // Fan-out #1: init → phase1_a, phase1_b, phase1_c (3 explicit transitions)
    // Each declares sibling_group to identify membership in the synchronization group
    const initToPhase1A = transition({
      ref: 'init_to_phase1_a',
      from_node_ref: 'init',
      to_node_ref: 'phase1_a',
      priority: 1,
      sibling_group: 'phase1_fanin', // Declares membership in 'phase1_fanin' group
    });

    const initToPhase1B = transition({
      ref: 'init_to_phase1_b',
      from_node_ref: 'init',
      to_node_ref: 'phase1_b',
      priority: 1,
      sibling_group: 'phase1_fanin', // Same group
    });

    const initToPhase1C = transition({
      ref: 'init_to_phase1_c',
      from_node_ref: 'init',
      to_node_ref: 'phase1_c',
      priority: 1,
      sibling_group: 'phase1_fanin', // Same group
    });

    // Fan-in #1: phase1_a, phase1_b, phase1_c → bridge
    // IDEAL: All three transitions share sibling_group 'phase1_fanin'
    // Coordinator MUST recognize these as siblings and synchronize accordingly
    const phase1AToBridge = transition({
      ref: 'phase1_a_to_bridge',
      from_node_ref: 'phase1_a',
      to_node_ref: 'bridge',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'phase1_fanin', // Named group identifies siblings
        merge: {
          source: '_branch.output.value',
          target: 'state.phase1.results',
          strategy: 'append',
        },
      },
    });

    const phase1BToBridge = transition({
      ref: 'phase1_b_to_bridge',
      from_node_ref: 'phase1_b',
      to_node_ref: 'bridge',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'phase1_fanin', // Same group = siblings
        merge: {
          source: '_branch.output.value',
          target: 'state.phase1.results',
          strategy: 'append',
        },
      },
    });

    const phase1CToBridge = transition({
      ref: 'phase1_c_to_bridge',
      from_node_ref: 'phase1_c',
      to_node_ref: 'bridge',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'phase1_fanin', // Same group = siblings
        merge: {
          source: '_branch.output.value',
          target: 'state.phase1.results',
          strategy: 'append',
        },
      },
    });

    // Fan-out #2: bridge → phase2_a, phase2_b, phase2_c (3 explicit transitions)
    // Each declares sibling_group for the second synchronization point
    const bridgeToPhase2A = transition({
      ref: 'bridge_to_phase2_a',
      from_node_ref: 'bridge',
      to_node_ref: 'phase2_a',
      priority: 1,
      sibling_group: 'phase2_fanin', // Declares membership in 'phase2_fanin' group
    });

    const bridgeToPhase2B = transition({
      ref: 'bridge_to_phase2_b',
      from_node_ref: 'bridge',
      to_node_ref: 'phase2_b',
      priority: 1,
      sibling_group: 'phase2_fanin', // Same group
    });

    const bridgeToPhase2C = transition({
      ref: 'bridge_to_phase2_c',
      from_node_ref: 'bridge',
      to_node_ref: 'phase2_c',
      priority: 1,
      sibling_group: 'phase2_fanin', // Same group
    });

    // Fan-in #2: phase2_a, phase2_b, phase2_c → summarize
    // IDEAL: All three transitions share sibling_group 'phase2_fanin'
    const phase2AToSummarize = transition({
      ref: 'phase2_a_to_summarize',
      from_node_ref: 'phase2_a',
      to_node_ref: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'phase2_fanin', // Named group identifies siblings
        merge: {
          source: '_branch.output.accumulated',
          target: 'state.phase2.accumulated',
          strategy: 'collect',
        },
      },
    });

    const phase2BToSummarize = transition({
      ref: 'phase2_b_to_summarize',
      from_node_ref: 'phase2_b',
      to_node_ref: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'phase2_fanin', // Same group = siblings
        merge: {
          source: '_branch.output.accumulated',
          target: 'state.phase2.accumulated',
          strategy: 'collect',
        },
      },
    });

    const phase2CToSummarize = transition({
      ref: 'phase2_c_to_summarize',
      from_node_ref: 'phase2_c',
      to_node_ref: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'phase2_fanin', // Same group = siblings
        merge: {
          source: '_branch.output.accumulated',
          target: 'state.phase2.accumulated',
          strategy: 'collect',
        },
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const workflowDef = workflow({
      name: 'Explicit Fan-Out Test',
      description:
        'Foundation test 06 - explicit fan-out with synchronization (IDEAL behavior spec)',
      input_schema: inputSchema,
      output_schema: workflowOutputSchema,
      context_schema: contextSchema,
      // Output mapping reads from merged state (written by fan-in transitions)
      output_mapping: {
        seed: '$.state.init.seed',
        // Phase1 results merged by fan-in (IDEAL: append strategy)
        phase1_results: '$.state.phase1.results',
        // Bridge reads from merged phase1 results
        bridge_phase1_words: '$.state.bridge.phase1_words',
        // Phase2 results merged by fan-in (IDEAL: collect strategy)
        phase2_accumulated: '$.state.phase2.accumulated',
        // Summary passthrough (proves all data flows correctly)
        summary_phase1_words: '$.state.summary.phase1_words',
        summary_phase2_accumulated: '$.state.summary.phase2_accumulated',
        summary_bridge_inherited: '$.state.summary.bridge_inherited',
      },
      initial_node_ref: 'init',
      nodes: [
        initNode,
        phase1ANode,
        phase1BNode,
        phase1CNode,
        bridgeNode,
        phase2ANode,
        phase2BNode,
        phase2CNode,
        summarizeNode,
      ],
      transitions: [
        // Fan-out #1
        initToPhase1A,
        initToPhase1B,
        initToPhase1C,
        // Fan-in #1
        phase1AToBridge,
        phase1BToBridge,
        phase1CToBridge,
        // Fan-out #2
        bridgeToPhase2A,
        bridgeToPhase2B,
        bridgeToPhase2C,
        // Fan-in #2
        phase2AToSummarize,
        phase2BToSummarize,
        phase2CToSummarize,
      ],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { seed: 'EXPLICIT' };
    const { result, cleanup } = await runTestWorkflow(workflowDef, workflowInput);

    try {
      const { trace, events } = result;

      // =========================================================================
      // INVARIANTS
      // =========================================================================
      assertInvariants(trace);

      // =========================================================================
      // VERIFICATION - IDEAL BEHAVIOR with synchronization
      // =========================================================================
      verify(trace, { input: workflowInput, definition: workflowDef, events })
        .completed()
        .withTokens({
          // Token structure (deterministic - all siblings create arrivals):
          // - 1 root token (init)
          // - 3 phase1 tokens (explicit fan-out: phase1_a, phase1_b, phase1_c)
          // - 3 phase1 fan-in arrivals (all 3 siblings create arrival tokens)
          // - 1 bridge continuation (spawned after all 3 arrive and merge)
          // - 3 phase2 tokens (explicit fan-out from bridge)
          // - 3 phase2 fan-in arrivals (all 3 siblings create arrival tokens)
          // - 1 summarize continuation (spawned after all 3 arrive and merge)
          // Total: 1 + 3 + 3 + 1 + 3 + 3 + 1 = 15
          root: 1,
          fanOuts: [
            { count: 3, branchTotal: 3, outputFields: ['value'] },
            { count: 3, branchTotal: 3, outputFields: ['accumulated'] },
          ],
          fanInArrivals: 6, // 3 for phase1→bridge + 3 for phase2→summarize (deterministic)
          fanInContinuations: 2, // 1 bridge + 1 summarize
          total: 15, // Deterministic token count
        })
        .withStateWriteOrder([
          // Init writes seed
          'state.init.seed',
          // Phase1 branches write to output.value (branch table), fan-in merges to state
          'state.phase1.results', // Merge target (append strategy)
          // Bridge writes
          'state.bridge.phase1_words',
          // Phase2 branches write to output.accumulated (branch table), fan-in collects
          'state.phase2.accumulated', // Merge target (collect strategy)
          // Summarize writes
          'state.summary.phase1_words',
          'state.summary.phase2_accumulated',
          'state.summary.bridge_inherited',
        ])
        .withStateWrites([
          { path: 'state.init.seed', type: 'string', description: 'Written by init' },
          {
            path: 'state.phase1.results',
            type: 'array',
            arrayLength: 3,
            description: 'Fan-in merge (append) writes merged phase1 results',
          },
          {
            path: 'state.bridge.phase1_words',
            type: 'array',
            arrayLength: 3,
            description: 'Bridge copies phase1.results',
          },
          {
            path: 'state.phase2.accumulated',
            type: 'array',
            arrayLength: 3, // 3 arrays (collect strategy)
            description: 'Fan-in merge (collect) writes collected phase2 arrays',
          },
          {
            path: 'state.summary.phase1_words',
            type: 'array',
            arrayLength: 3,
            description: 'Summary passthrough of merged phase1 words',
          },
          {
            path: 'state.summary.phase2_accumulated',
            type: 'array',
            arrayLength: 3,
            description: 'Summary passthrough of merged phase2 arrays',
          },
          {
            path: 'state.summary.bridge_inherited',
            type: 'array',
            arrayLength: 3,
            description: 'Summary passthrough of bridge inherited words',
          },
        ])
        .withBranchWrites({
          uniqueTokenCount: 6, // 3 explicit phase1 nodes + 3 explicit phase2 nodes
        })
        .withOutput({
          seed: { type: 'string', defined: true },
          phase1_results: { type: 'array', arrayLength: 3 },
          phase2_accumulated: { type: 'array', arrayLength: 3 }, // 3 arrays (one per explicit node)
          bridge_phase1_words: { type: 'array', arrayLength: 3 },
          summary_phase1_words: { type: 'array', arrayLength: 3 },
          summary_phase2_accumulated: { type: 'array', arrayLength: 3 },
          summary_bridge_inherited: { type: 'array', arrayLength: 3 },
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
        // =====================================================================
        // CRITICAL: Value flow verification
        // This proves ACTUAL VALUES flow through the pipeline, not just paths
        // =====================================================================
        .withCustom('value-flow-verification', (_trace, ctx) => {
          const output = ctx.collected.finalOutput as {
            phase1_results: string[];
            phase2_accumulated: string[][]; // Array of arrays (3 arrays, each with 4 items)
            bridge_phase1_words: string[];
            summary_phase1_words: string[];
            summary_phase2_accumulated: string[][];
            summary_bridge_inherited: string[];
          } | null;

          if (!output) {
            throw new Error('VALUE FLOW VERIFICATION: No final output found');
          }

          // 1. Bridge received phase1 results (values match)
          const phase1Words = output.phase1_results;
          const bridgeInherited = output.bridge_phase1_words;

          if (JSON.stringify(phase1Words.sort()) !== JSON.stringify(bridgeInherited.sort())) {
            throw new Error(
              `VALUE FLOW BROKEN: bridge.phase1_words should equal phase1.results\n` +
                `  phase1.results: ${JSON.stringify(phase1Words)}\n` +
                `  bridge.phase1_words: ${JSON.stringify(bridgeInherited)}`,
            );
          }

          // 2. Summarize received phase1 results (values match)
          const summaryPhase1 = output.summary_phase1_words;
          if (JSON.stringify(phase1Words.sort()) !== JSON.stringify(summaryPhase1.sort())) {
            throw new Error(
              `VALUE FLOW BROKEN: summary.phase1_words should equal phase1.results\n` +
                `  phase1.results: ${JSON.stringify(phase1Words)}\n` +
                `  summary.phase1_words: ${JSON.stringify(summaryPhase1)}`,
            );
          }

          // 3. CRITICAL: Collected result is 3 arrays (one per explicit branch)
          // Each array has 4 items: 3 inherited words + 1 new word
          const phase2Accumulated = output.phase2_accumulated;
          if (phase2Accumulated.length !== 3) {
            throw new Error(
              `VALUE ACCUMULATION BROKEN: phase2_accumulated should have 3 arrays (one per explicit branch)\n` +
                `  Got ${phase2Accumulated.length} items: ${JSON.stringify(phase2Accumulated)}\n` +
                `  Expected: 3 arrays, each with 4 items`,
            );
          }

          // 4. Each branch array has 4 items (3 inherited + 1 new)
          for (let i = 0; i < phase2Accumulated.length; i++) {
            const branchArray = phase2Accumulated[i];
            if (branchArray.length !== 4) {
              throw new Error(
                `VALUE ACCUMULATION BROKEN: Branch ${i} should have 4 items (3 inherited + 1 new)\n` +
                  `  Got ${branchArray.length}: ${JSON.stringify(branchArray)}`,
              );
            }
          }

          // 5. Each branch array contains all 3 phase1 words (inherited)
          for (let i = 0; i < phase2Accumulated.length; i++) {
            const branchArray = phase2Accumulated[i];
            for (const word of phase1Words) {
              if (!branchArray.includes(word)) {
                throw new Error(
                  `VALUE ACCUMULATION BROKEN: Branch ${i} should contain inherited word "${word}"\n` +
                    `  Branch array: ${JSON.stringify(branchArray)}\n` +
                    `  Expected phase1 words: ${JSON.stringify(phase1Words)}`,
                );
              }
            }
          }

          // 6. Each branch array has exactly 1 new word (not in phase1)
          for (let i = 0; i < phase2Accumulated.length; i++) {
            const branchArray = phase2Accumulated[i];
            const newWords = branchArray.filter((w) => !phase1Words.includes(w));
            if (newWords.length !== 1) {
              throw new Error(
                `VALUE ACCUMULATION BROKEN: Branch ${i} should have exactly 1 new word\n` +
                  `  Found ${newWords.length}: ${JSON.stringify(newWords)}\n` +
                  `  Branch array: ${JSON.stringify(branchArray)}`,
              );
            }
          }

          // 7. Summarize received bridge's copy (values match original phase1)
          const summaryBridgeInherited = output.summary_bridge_inherited;
          if (
            JSON.stringify(phase1Words.sort()) !== JSON.stringify(summaryBridgeInherited.sort())
          ) {
            throw new Error(
              `VALUE FLOW BROKEN: summary.bridge_inherited should equal phase1.results\n` +
                `  phase1.results: ${JSON.stringify(phase1Words)}\n` +
                `  summary.bridge_inherited: ${JSON.stringify(summaryBridgeInherited)}`,
            );
          }

          // 8. Summarize received phase2 accumulated (same 3 arrays)
          const summaryPhase2Accumulated = output.summary_phase2_accumulated;
          if (summaryPhase2Accumulated.length !== 3) {
            throw new Error(
              `VALUE FLOW BROKEN: summary.phase2_accumulated should have 3 arrays\n` +
                `  Got: ${summaryPhase2Accumulated.length}`,
            );
          }

          // All value flow checks passed!
        })
        .run();
    } finally {
      await cleanup();
    }
  });
});
