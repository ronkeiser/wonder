import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, TIME_JITTER, verify } from '~/kit';

/**
 * Foundation Test 04: Nested State Structure with Value Flow Validation
 *
 * Tests that ACTUAL VALUES flow through the pipeline, not just that paths are written.
 * Uses updateContext (passthrough) actions to prove data aggregation works.
 *
 * Workflow structure:
 *   [init] → (spawn 3) → [phase1] ×3 → (fan-in: merge) →
 *   [bridge] → (spawn 3) → [phase2] ×3 → (fan-in: merge) → [summarize]
 *
 * Data flow proof:
 * 1. Phase1 branches generate words: ["word1", "word2", "word3"]
 * 2. Fan-in merges to state.phase1.results
 * 3. Bridge reads phase1.results, passes through as inheritedWords
 * 4. Bridge writes inheritedWords to state.bridge.phase1_words (PROVES IT RECEIVED THEM)
 * 5. Phase2 branches read state.bridge.phase1_words, pass through
 * 6. Phase2 branches write to output.inheritedWords (PROVES THEY RECEIVED THEM)
 * 7. Summarize reads ALL accumulated state and produces final object
 * 8. Custom verification checks actual values match across the pipeline
 *
 * This proves:
 * 1. Nested JSONPath mapping works
 * 2. Fan-in merge collects actual values
 * 3. Downstream nodes receive the aggregated values (not random data)
 * 4. Values are preserved through passthrough nodes
 * 5. Final output contains the original values from phase1
 */

describe('Foundation: 04 - Nested State Structure', () => {
  it('executes workflow with deeply nested state objects', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      seed: s.string(),
    });

    const initOutputSchema = s.object({ seed: s.string() }, { required: ['seed'] });

    const phase1OutputSchema = s.object({ value: s.string() }, { required: ['value'] });

    // Bridge passes through phase1_results to prove it received them
    const bridgeOutputSchema = s.object(
      {
        phase1_words: s.array(s.string()), // Passthrough of phase1.results
      },
      { required: ['phase1_words'] },
    );

    // Phase2 accumulates: inherited words + new word = grown array
    const phase2OutputSchema = s.object(
      {
        accumulated: s.array(s.string()), // inheritedWords + word merged together
      },
      { required: ['accumulated'] },
    );

    // Summarize passes through ALL accumulated data to prove it received everything
    const summarizeOutputSchema = s.object(
      {
        phase1_words: s.array(s.string()),
        phase2_accumulated: s.array(s.array(s.string())), // Array of accumulated arrays (preserved structure)
        bridge_inherited: s.array(s.string()),
      },
      { required: ['phase1_words', 'phase2_accumulated', 'bridge_inherited'] },
    );

    // Nested context schema - shows actual data flowing through
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
        // Fan-in collects accumulated arrays preserving structure: [[4 items], [4 items], [4 items]]
        accumulated: s.array(s.array(s.string())),
      }),
      summary: s.object({
        phase1_words: s.array(s.string()),
        phase2_accumulated: s.array(s.array(s.string())), // Array of arrays
        bridge_inherited: s.array(s.string()),
      }),
    });

    // Output exposes all paths for verification that values flowed correctly
    const workflowOutputSchema = s.object({
      seed: s.string(),
      // From phase1 fan-in (3 words)
      phase1_results: s.array(s.string()),
      // From bridge passthrough
      bridge_phase1_words: s.array(s.string()),
      // From phase2 fan-in with 'collect': 3 arrays of 4 items each
      phase2_accumulated: s.array(s.array(s.string())),
      // From summarize passthrough
      summary_phase1_words: s.array(s.string()),
      summary_phase2_accumulated: s.array(s.array(s.string())), // Array of arrays
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
      ref: 'initStep',
      ordinal: 0,
      action: initAction,
      inputMapping: {},
      outputMapping: { 'output.seed': 'result.seed' },
    });

    const initTask = task({
      name: 'Init Task',
      description: 'Initialize workflow',
      inputSchema: s.object({ seed: s.string() }),
      outputSchema: initOutputSchema,
      steps: [initStep],
    });

    const initNode = node({
      ref: 'init',
      name: 'Init',
      task: initTask,
      taskVersion: 1,
      inputMapping: { seed: 'input.seed' },
      // Write to nested path: state.init.seed
      outputMapping: { 'state.init.seed': 'result.seed' },
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
        options: { stringMode: 'words', delay: TIME_JITTER },
      },
    });

    const phase1Step = step({
      ref: 'phase1_step',
      ordinal: 0,
      action: phase1Action,
      inputMapping: {},
      outputMapping: { 'output.value': 'result.value' },
    });

    const phase1Task = task({
      name: 'Phase 1 Task',
      description: 'Process in phase 1',
      inputSchema: s.object({ seed: s.string() }),
      outputSchema: phase1OutputSchema,
      steps: [phase1Step],
    });

    const phase1Node = node({
      ref: 'phase1',
      name: 'Phase 1',
      task: phase1Task,
      taskVersion: 1,
      // Read from nested path: state.init.seed
      inputMapping: { seed: 'state.init.seed' },
      outputMapping: { 'output.value': 'result.value' },
    });

    // =========================================================================
    // Node: bridge (between fan-in #1 and fan-out #2)
    // Uses updateContext (passthrough) to prove it receives phase1.results
    // =========================================================================
    const bridgeAction = action({
      name: 'Bridge Action',
      description: 'Passthrough - proves bridge receives aggregated phase1 results',
      kind: 'context',
      implementation: {},
    });

    const bridgeStep = step({
      ref: 'bridge_step',
      ordinal: 0,
      action: bridgeAction,
      // Pass phase1_words from task input to step input
      inputMapping: { phase1_words: 'input.phase1_words' },
      // Passthrough returns input as output - map it to task output
      outputMapping: { 'output.phase1_words': 'result.phase1_words' },
    });

    const bridgeTask = task({
      name: 'Bridge Task',
      description: 'Passthrough bridge - receives and forwards phase1 results',
      inputSchema: s.object({ phase1_words: s.array(s.string()) }),
      outputSchema: bridgeOutputSchema,
      steps: [bridgeStep],
    });

    const bridgeNode = node({
      ref: 'bridge',
      name: 'Bridge',
      task: bridgeTask,
      taskVersion: 1,
      // Read aggregated phase1 results
      inputMapping: { phase1_words: 'state.phase1.results' },
      // Write to state.bridge.phase1_words - PROVES bridge received the data
      outputMapping: {
        'state.bridge.phase1_words': 'result.phase1_words',
      },
    });

    // =========================================================================
    // Node: phase2 (runs 3 times in parallel, reads aggregated phase1 state via bridge)
    // Each branch: generates a word, then merges it with inherited words
    // This proves ACCUMULATION: array grows from 3 to 4 items
    // =========================================================================

    // Step 1: Generate a new word
    const phase2WordAction = action({
      name: 'Phase 2 Word Action',
      description: 'Generates a word for this branch',
      kind: 'mock',
      implementation: {
        schema: s.object({ word: s.string() }, { required: ['word'] }),
        options: { stringMode: 'words', delay: TIME_JITTER },
      },
    });

    const phase2WordStep = step({
      ref: 'phase2_word_step',
      ordinal: 0,
      action: phase2WordAction,
      inputMapping: {},
      outputMapping: { 'output.word': 'result.word' },
    });

    // Step 2: Merge inheritedWords + word into accumulated
    const phase2MergeAction = action({
      name: 'Phase 2 Merge Action',
      description: 'Merges inherited words with new word - proves accumulation',
      kind: 'context',
      implementation: {
        merge: {
          target: 'accumulated',
          sources: ['inheritedWords', 'word'],
        },
      },
    });

    const phase2MergeStep = step({
      ref: 'phase2_merge_step',
      ordinal: 1,
      action: phase2MergeAction,
      inputMapping: {
        inheritedWords: 'input.inheritedWords',
        word: 'output.word',
      },
      outputMapping: {
        'output.accumulated': 'result.accumulated',
      },
    });

    const phase2Task = task({
      name: 'Phase 2 Task',
      description: 'Generates word and accumulates with inherited - array grows',
      inputSchema: s.object({
        inheritedWords: s.array(s.string()),
      }),
      outputSchema: phase2OutputSchema,
      steps: [phase2WordStep, phase2MergeStep],
    });

    const phase2Node = node({
      ref: 'phase2',
      name: 'Phase 2',
      task: phase2Task,
      taskVersion: 1,
      inputMapping: {
        inheritedWords: 'state.bridge.phase1_words',
      },
      outputMapping: {
        'output.accumulated': 'result.accumulated',
      },
    });

    // =========================================================================
    // Node: summarize (after fan-in #2)
    // Uses updateContext (passthrough) to prove it receives all accumulated state
    // =========================================================================
    const summarizeAction = action({
      name: 'Summarize Action',
      description: 'Passthrough - proves summarize receives all accumulated state',
      kind: 'context',
      implementation: {},
    });

    const summarizeStep = step({
      ref: 'summarizeStep',
      ordinal: 0,
      action: summarizeAction,
      // Pass all accumulated data through
      inputMapping: {
        phase1_words: 'input.phase1_words',
        phase2_accumulated: 'input.phase2_accumulated',
        bridge_inherited: 'input.bridge_inherited',
      },
      outputMapping: {
        'output.phase1_words': 'result.phase1_words',
        'output.phase2_accumulated': 'result.phase2_accumulated',
        'output.bridge_inherited': 'result.bridge_inherited',
      },
    });

    const summarizeTask = task({
      name: 'Summarize Task',
      description: 'Passthrough - receives and forwards all accumulated state',
      inputSchema: s.object({
        phase1_words: s.array(s.string()),
        phase2_accumulated: s.array(s.array(s.string())), // Array of arrays (collect preserves structure)
        bridge_inherited: s.array(s.string()),
      }),
      outputSchema: summarizeOutputSchema,
      steps: [summarizeStep],
    });

    const summarizeNode = node({
      ref: 'summarize',
      name: 'Summarize',
      task: summarizeTask,
      taskVersion: 1,
      // Read all accumulated state
      inputMapping: {
        phase1_words: 'state.phase1.results',
        phase2_accumulated: 'state.phase2.accumulated',
        bridge_inherited: 'state.bridge.phase1_words',
      },
      // Write all to summary state - PROVES summarize received everything
      outputMapping: {
        'state.summary.phase1_words': 'result.phase1_words',
        'state.summary.phase2_accumulated': 'result.phase2_accumulated',
        'state.summary.bridge_inherited': 'result.bridge_inherited',
      },
    });

    // =========================================================================
    // Transitions
    // =========================================================================

    // Fan-out #1: init → phase1 (spawn 3)
    const fanOut1 = transition({
      ref: 'fanout_1',
      fromNodeRef: 'init',
      toNodeRef: 'phase1',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'phase1_group',
    });

    // Fan-in #1: phase1 → bridge (merge to nested path)
    const fanIn1 = transition({
      ref: 'fanin_1',
      fromNodeRef: 'phase1',
      toNodeRef: 'bridge',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'phase1_group',
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
      fromNodeRef: 'bridge',
      toNodeRef: 'phase2',
      priority: 1,
      spawnCount: 3,
      siblingGroup: 'phase2_group',
    });

    // Fan-in #2: phase2 → summarize (collect accumulated arrays, preserve structure)
    const fanIn2 = transition({
      ref: 'fanin_2',
      fromNodeRef: 'phase2',
      toNodeRef: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'phase2_group',
        merge: {
          source: '_branch.output.accumulated', // Each branch's accumulated array
          target: 'state.phase2.accumulated', // Collect as array of arrays (no flattening)
          strategy: 'collect', // Preserves structure: [[a,b,c,d], [a,b,c,e], [a,b,c,f]]
        },
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const workflowDef = workflow({
      name: 'Nested State Structure Test',
      description: 'Foundation test 04 - proves actual values flow through pipeline',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      // Output mapping exposes all paths for value flow verification
      outputMapping: {
        seed: 'state.init.seed',
        // Direct from fan-in merges
        phase1_results: 'state.phase1.results',
        phase2_accumulated: 'state.phase2.accumulated', // Array of accumulated arrays
        // From bridge (proves bridge received phase1.results)
        bridge_phase1_words: 'state.bridge.phase1_words',
        // From summarize (proves summarize received all accumulated state)
        summary_phase1_words: 'state.summary.phase1_words',
        summary_phase2_accumulated: 'state.summary.phase2_accumulated',
        summary_bridge_inherited: 'state.summary.bridge_inherited',
      },
      initialNodeRef: 'init',
      nodes: [initNode, phase1Node, bridgeNode, phase2Node, summarizeNode],
      transitions: [fanOut1, fanIn1, fanOut2, fanIn2],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { seed: 'NESTED' };
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
          // Token structure:
          // - 1 root token (init)
          // - 3 phase1 tokens (fan-out #1)
          // - 3 fan-in arrival tokens (all siblings create arrivals - deterministic)
          // - 1 bridge continuation token
          // - 3 phase2 tokens (fan-out #2)
          // - 3 fan-in arrival tokens (all siblings create arrivals - deterministic)
          // - 1 summarize continuation token
          // Total: 1 + 3 + 3 + 1 + 3 + 3 + 1 = 15
          root: 1,
          fanOuts: [
            { count: 3, branchTotal: 3, outputFields: ['value'] },
            { count: 3, branchTotal: 3, outputFields: ['accumulated'] }, // merged array
          ],
          fanInArrivals: 6, // 3 for fanIn1 + 3 for fanIn2 (deterministic)
          fanInContinuations: 2,
          total: 15,
        })
        .withStateWriteOrder([
          // Phase 1: init → fan-out → fan-in → bridge
          'state.init.seed',
          'state.phase1.results', // Fan-in merge (3 words from phase1 branches)
          'state.bridge.phase1_words', // Bridge passthrough (PROVES it received phase1.results)
          // Phase 2: fan-out → phase2 branches → fan-in → summarize
          'state.phase2.accumulated', // Fan-in merge (3 accumulated arrays from phase2 branches)
          // Summarize writes all accumulated data
          'state.summary.phase1_words', // PROVES summarize received phase1.results
          'state.summary.phase2_accumulated', // PROVES summarize received phase2.accumulated
          'state.summary.bridge_inherited', // PROVES summarize received bridge.phase1_words
        ])
        .withStateWrites([
          { path: 'state.init.seed', type: 'string', description: 'Written by init' },
          {
            path: 'state.phase1.results',
            type: 'array',
            arrayLength: 3,
            description: 'Fan-in #1 merges phase1 outputs (3 words)',
          },
          {
            path: 'state.bridge.phase1_words',
            type: 'array',
            arrayLength: 3,
            description: 'Bridge passthrough - PROVES it received phase1.results',
          },
          {
            path: 'state.phase2.accumulated',
            type: 'array',
            arrayLength: 3, // 3 arrays (one per branch, each with 4 items)
            description: 'Fan-in #2 collects accumulated arrays preserving structure',
          },
          {
            path: 'state.summary.phase1_words',
            type: 'array',
            arrayLength: 3,
            description: 'Summary passthrough - PROVES it received phase1.results',
          },
          {
            path: 'state.summary.phase2_accumulated',
            type: 'array',
            arrayLength: 3, // Same 3 arrays from phase2.accumulated
            description: 'Summary passthrough - PROVES it received phase2.accumulated',
          },
          {
            path: 'state.summary.bridge_inherited',
            type: 'array',
            arrayLength: 3,
            description: 'Summary passthrough - PROVES it received bridge.phase1_words',
          },
        ])
        .withBranchWrites({
          uniqueTokenCount: 6, // 3 phase1 + 3 phase2 branches
        })
        .withOutput({
          seed: { type: 'string', defined: true },
          phase1_results: { type: 'array', arrayLength: 3 },
          phase2_accumulated: { type: 'array', arrayLength: 3 }, // 3 arrays (one per branch)
          bridge_phase1_words: { type: 'array', arrayLength: 3 },
          summary_phase1_words: { type: 'array', arrayLength: 3 },
          summary_phase2_accumulated: { type: 'array', arrayLength: 3 }, // Same 3 arrays
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

          // 3. CRITICAL: Collected result is 3 arrays (one per branch)
          // Each array has 4 items: 3 inherited words + 1 new word
          const phase2Accumulated = output.phase2_accumulated;
          if (phase2Accumulated.length !== 3) {
            throw new Error(
              `VALUE ACCUMULATION BROKEN: phase2_accumulated should have 3 arrays (one per branch)\n` +
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
  });
});
