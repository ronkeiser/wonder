import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, verify } from '~/kit';

/**
 * Foundation Test 05: Deep Nested State Structure with Three-Phase Accumulation
 *
 * Extends test 04 with one more phase, proving accumulation compounds correctly:
 *
 * Phase 1: 3 branches each output a word
 *   → Fan-in APPENDS → string[3]
 *
 * Phase 2: 3 branches each receive string[3], add their own word
 *   → Each outputs string[4] (3 inherited + 1 new)
 *   → Fan-in COLLECTS → string[3][4] (2D array)
 *
 * Phase 3: 3 branches each receive string[3][4], add their own word as new row
 *   → Each outputs string[4][5] (inherited 3×4 grid + 1 new row of 1)
 *   → Fan-in COLLECTS → string[3][4][5] (3D array)
 *
 * IDEAL BEHAVIOR for update_context merge:
 *   When merging an array with a scalar, APPEND the scalar to the array.
 *   When merging an array of arrays with a scalar, wrap scalar in array and APPEND.
 *
 * Deep nesting (4+ levels in state paths):
 *   state.pipeline.stages.init.config.seed
 *   state.pipeline.stages.phase1.results.words
 *   state.pipeline.stages.phase2.results.accumulated
 *   state.pipeline.stages.phase3.results.final
 */

describe('Foundation: 05 - Deep Nested State Structure', () => {
  it(
    'executes workflow with deeply nested state objects and three-phase accumulation',
    { timeout: 120000 },
    async () => {
      // =========================================================================
      // Schemas
      // =========================================================================
      const inputSchema = s.object({
        seed: s.string(),
      });

      const initOutputSchema = s.object({ seed: s.string() }, { required: ['seed'] });

      // Phase 1 outputs a single word
      const phase1OutputSchema = s.object({ word: s.string() }, { required: ['word'] });

      // Bridge1 passes through phase1 words
      const bridge1OutputSchema = s.object(
        { phase1_words: s.array(s.string()) },
        { required: ['phase1_words'] },
      );

      // Phase 2 accumulates: inherited words (3) + new word (1) = string[4]
      const phase2OutputSchema = s.object(
        { accumulated: s.array(s.string()) },
        { required: ['accumulated'] },
      );

      // Bridge2 passes through phase2 accumulated arrays
      const bridge2OutputSchema = s.object(
        { phase2_accumulated: s.array(s.array(s.string())) },
        { required: ['phase2_accumulated'] },
      );

      // Phase 3 accumulates: inherited array-of-arrays + new word as new row
      // IDEAL: string[4][5] (inherited 3 rows of 4 + 1 new row with 1 item)
      // This requires update_context to support appending a scalar wrapped in array
      const phase3OutputSchema = s.object(
        { final: s.array(s.array(s.string())) },
        { required: ['final'] },
      );

      // Final output receives all accumulated state
      const finalizeOutputSchema = s.object(
        {
          phase1_words: s.array(s.string()),
          phase2_accumulated: s.array(s.array(s.string())),
          phase3_final: s.array(s.array(s.array(s.string()))),
        },
        { required: ['phase1_words', 'phase2_accumulated', 'phase3_final'] },
      );

      // Deep nested context schema (4+ levels)
      const contextSchema = s.object({
        pipeline: s.object({
          stages: s.object({
            init: s.object({
              config: s.object({
                seed: s.string(),
              }),
            }),
            phase1: s.object({
              results: s.object({
                words: s.array(s.string()),
              }),
            }),
            phase2: s.object({
              results: s.object({
                accumulated: s.array(s.array(s.string())),
              }),
            }),
            phase3: s.object({
              results: s.object({
                final: s.array(s.array(s.array(s.string()))),
              }),
            }),
          }),
          bridges: s.object({
            bridge1: s.object({
              inherited: s.object({
                words: s.array(s.string()),
              }),
            }),
            bridge2: s.object({
              inherited: s.object({
                accumulated: s.array(s.array(s.string())),
              }),
            }),
          }),
        }),
      });

      // Output exposes all paths for verification
      const workflowOutputSchema = s.object({
        seed: s.string(),
        phase1_words: s.array(s.string()),
        phase2_accumulated: s.array(s.array(s.string())),
        phase3_final: s.array(s.array(s.array(s.string()))),
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
        output_mapping: { 'state.pipeline.stages.init.config.seed': '$.seed' },
      });

      // =========================================================================
      // Node: phase1 (runs 3 times in parallel)
      // =========================================================================
      const phase1Action = action({
        name: 'Phase 1 Action',
        description: 'Generate a word',
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
        output_mapping: { 'output.word': '$.word' },
      });

      const phase1Task = task({
        name: 'Phase 1 Task',
        description: 'Generate a word',
        input_schema: s.object({ seed: s.string() }),
        output_schema: phase1OutputSchema,
        steps: [phase1Step],
      });

      const phase1Node = node({
        ref: 'phase1',
        name: 'Phase 1',
        task: phase1Task,
        task_version: 1,
        input_mapping: { seed: '$.state.pipeline.stages.init.config.seed' },
        output_mapping: { 'output.word': '$.word' },
      });

      // =========================================================================
      // Node: bridge1
      // =========================================================================
      const bridge1Action = action({
        name: 'Bridge1 Action',
        description: 'Passthrough phase1 results',
        kind: 'update_context',
        implementation: {},
      });

      const bridge1Step = step({
        ref: 'bridge1_step',
        ordinal: 0,
        action: bridge1Action,
        action_version: 1,
        input_mapping: { phase1_words: '$.input.phase1_words' },
        output_mapping: { 'output.phase1_words': '$.phase1_words' },
      });

      const bridge1Task = task({
        name: 'Bridge1 Task',
        description: 'Passthrough bridge',
        input_schema: s.object({ phase1_words: s.array(s.string()) }),
        output_schema: bridge1OutputSchema,
        steps: [bridge1Step],
      });

      const bridge1Node = node({
        ref: 'bridge1',
        name: 'Bridge1',
        task: bridge1Task,
        task_version: 1,
        input_mapping: { phase1_words: '$.state.pipeline.stages.phase1.results.words' },
        output_mapping: {
          'state.pipeline.bridges.bridge1.inherited.words': '$.phase1_words',
        },
      });

      // =========================================================================
      // Node: phase2 (runs 3 times in parallel)
      // Each branch: receives string[3], generates word, outputs string[4]
      // =========================================================================
      const phase2WordAction = action({
        name: 'Phase 2 Word Action',
        description: 'Generate a word',
        kind: 'mock',
        implementation: {
          schema: s.object({ word: s.string() }, { required: ['word'] }),
          options: { stringMode: 'words', delay: { min_ms: 50, max_ms: 200 } },
        },
      });

      const phase2WordStep = step({
        ref: 'phase2_word_step',
        ordinal: 0,
        action: phase2WordAction,
        action_version: 1,
        input_mapping: {},
        output_mapping: { 'output.word': '$.word' },
      });

      // Merge inherited_words (string[3]) + word (string) → accumulated (string[4])
      const phase2MergeAction = action({
        name: 'Phase 2 Merge Action',
        description: 'Merge inherited words with new word',
        kind: 'update_context',
        implementation: {
          merge: {
            target: 'accumulated',
            sources: ['inherited_words', 'word'],
          },
        },
      });

      const phase2MergeStep = step({
        ref: 'phase2_merge_step',
        ordinal: 1,
        action: phase2MergeAction,
        action_version: 1,
        input_mapping: {
          inherited_words: '$.input.inherited_words',
          word: '$.output.word',
        },
        output_mapping: { 'output.accumulated': '$.accumulated' },
      });

      const phase2Task = task({
        name: 'Phase 2 Task',
        description: 'Accumulate inherited words with new word',
        input_schema: s.object({ inherited_words: s.array(s.string()) }),
        output_schema: phase2OutputSchema,
        steps: [phase2WordStep, phase2MergeStep],
      });

      const phase2Node = node({
        ref: 'phase2',
        name: 'Phase 2',
        task: phase2Task,
        task_version: 1,
        input_mapping: {
          inherited_words: '$.state.pipeline.bridges.bridge1.inherited.words',
        },
        output_mapping: { 'output.accumulated': '$.accumulated' },
      });

      // =========================================================================
      // Node: bridge2
      // =========================================================================
      const bridge2Action = action({
        name: 'Bridge2 Action',
        description: 'Passthrough phase2 results',
        kind: 'update_context',
        implementation: {},
      });

      const bridge2Step = step({
        ref: 'bridge2_step',
        ordinal: 0,
        action: bridge2Action,
        action_version: 1,
        input_mapping: { phase2_accumulated: '$.input.phase2_accumulated' },
        output_mapping: { 'output.phase2_accumulated': '$.phase2_accumulated' },
      });

      const bridge2Task = task({
        name: 'Bridge2 Task',
        description: 'Passthrough bridge',
        input_schema: s.object({ phase2_accumulated: s.array(s.array(s.string())) }),
        output_schema: bridge2OutputSchema,
        steps: [bridge2Step],
      });

      const bridge2Node = node({
        ref: 'bridge2',
        name: 'Bridge2',
        task: bridge2Task,
        task_version: 1,
        input_mapping: { phase2_accumulated: '$.state.pipeline.stages.phase2.results.accumulated' },
        output_mapping: {
          'state.pipeline.bridges.bridge2.inherited.accumulated': '$.phase2_accumulated',
        },
      });

      // =========================================================================
      // Node: phase3 (runs 3 times in parallel)
      // Each branch: receives string[3][4], generates word, outputs string[4][5]
      // IDEAL: Append new word as a new row to the 2D array
      // =========================================================================
      const phase3WordAction = action({
        name: 'Phase 3 Word Action',
        description: 'Generate a word',
        kind: 'mock',
        implementation: {
          schema: s.object({ word: s.string() }, { required: ['word'] }),
          options: { stringMode: 'words', delay: { min_ms: 50, max_ms: 200 } },
        },
      });

      const phase3WordStep = step({
        ref: 'phase3_word_step',
        ordinal: 0,
        action: phase3WordAction,
        action_version: 1,
        input_mapping: {},
        output_mapping: { 'output.word': '$.word' },
      });

      // IDEAL BEHAVIOR:
      // Merge inherited_accumulated (string[3][4]) + word (string) → final (string[4][5])
      // This should append word_row as a new row to the 2D array
      // Using mode: 'append' to preserve nested structure
      const phase3MergeAction = action({
        name: 'Phase 3 Merge Action',
        description: 'Append new word as new row to inherited 2D array',
        kind: 'update_context',
        implementation: {
          merge: {
            target: 'final',
            sources: ['inherited_accumulated', 'word_row'],
            mode: 'append', // Preserve structure: append word_row as new element
          },
        },
      });

      const phase3MergeStep = step({
        ref: 'phase3_merge_step',
        ordinal: 1,
        action: phase3MergeAction,
        action_version: 1,
        input_mapping: {
          inherited_accumulated: '$.input.inherited_accumulated',
          // Wrap word in array so it becomes a row
          word_row: '$.output.word_row',
        },
        output_mapping: { 'output.final': '$.final' },
      });

      // Step to wrap word in array (creating a row)
      const phase3WrapAction = action({
        name: 'Phase 3 Wrap Action',
        description: 'Wrap word in array to create a row',
        kind: 'update_context',
        implementation: {
          merge: {
            target: 'word_row',
            sources: ['word'],
          },
        },
      });

      const phase3WrapStep = step({
        ref: 'phase3_wrap_step',
        ordinal: 1,
        action: phase3WrapAction,
        action_version: 1,
        input_mapping: { word: '$.output.word' },
        output_mapping: { 'output.word_row': '$.word_row' },
      });

      // Fix ordinal to 2 (third step)
      const phase3MergeStepFixed = step({
        ref: 'phase3_merge_step',
        ordinal: 2,
        action: phase3MergeAction,
        action_version: 1,
        input_mapping: {
          inherited_accumulated: '$.input.inherited_accumulated',
          word_row: '$.output.word_row',
        },
        output_mapping: { 'output.final': '$.final' },
      });

      const phase3Task = task({
        name: 'Phase 3 Task',
        description: 'Append new row to inherited 2D array',
        input_schema: s.object({ inherited_accumulated: s.array(s.array(s.string())) }),
        output_schema: phase3OutputSchema,
        steps: [phase3WordStep, phase3WrapStep, phase3MergeStepFixed],
      });

      const phase3Node = node({
        ref: 'phase3',
        name: 'Phase 3',
        task: phase3Task,
        task_version: 1,
        input_mapping: {
          inherited_accumulated: '$.state.pipeline.bridges.bridge2.inherited.accumulated',
        },
        output_mapping: { 'output.final': '$.final' },
      });

      // =========================================================================
      // Node: finalize
      // =========================================================================
      const finalizeAction = action({
        name: 'Finalize Action',
        description: 'Passthrough all accumulated state',
        kind: 'update_context',
        implementation: {},
      });

      const finalizeStep = step({
        ref: 'finalize_step',
        ordinal: 0,
        action: finalizeAction,
        action_version: 1,
        input_mapping: {
          phase1_words: '$.input.phase1_words',
          phase2_accumulated: '$.input.phase2_accumulated',
          phase3_final: '$.input.phase3_final',
        },
        output_mapping: {
          'output.phase1_words': '$.phase1_words',
          'output.phase2_accumulated': '$.phase2_accumulated',
          'output.phase3_final': '$.phase3_final',
        },
      });

      const finalizeTask = task({
        name: 'Finalize Task',
        description: 'Passthrough all accumulated state',
        input_schema: s.object({
          phase1_words: s.array(s.string()),
          phase2_accumulated: s.array(s.array(s.string())),
          phase3_final: s.array(s.array(s.array(s.string()))),
        }),
        output_schema: finalizeOutputSchema,
        steps: [finalizeStep],
      });

      const finalizeNode = node({
        ref: 'finalize',
        name: 'Finalize',
        task: finalizeTask,
        task_version: 1,
        input_mapping: {
          phase1_words: '$.state.pipeline.stages.phase1.results.words',
          phase2_accumulated: '$.state.pipeline.stages.phase2.results.accumulated',
          phase3_final: '$.state.pipeline.stages.phase3.results.final',
        },
        output_mapping: {},
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

      // Fan-in #1: phase1 → bridge1 (append words)
      const fanIn1 = transition({
        ref: 'fanin_1',
        from_node_ref: 'phase1',
        to_node_ref: 'bridge1',
        priority: 1,
        synchronization: {
          strategy: 'all',
          sibling_group: 'fanout_1',
          merge: {
            source: '_branch.output.word',
            target: 'state.pipeline.stages.phase1.results.words',
            strategy: 'append',
          },
        },
      });

      // Fan-out #2: bridge1 → phase2 (spawn 3)
      const fanOut2 = transition({
        ref: 'fanout_2',
        from_node_ref: 'bridge1',
        to_node_ref: 'phase2',
        priority: 1,
        spawn_count: 3,
      });

      // Fan-in #2: phase2 → bridge2 (collect accumulated arrays)
      const fanIn2 = transition({
        ref: 'fanin_2',
        from_node_ref: 'phase2',
        to_node_ref: 'bridge2',
        priority: 1,
        synchronization: {
          strategy: 'all',
          sibling_group: 'fanout_2',
          merge: {
            source: '_branch.output.accumulated',
            target: 'state.pipeline.stages.phase2.results.accumulated',
            strategy: 'collect',
          },
        },
      });

      // Fan-out #3: bridge2 → phase3 (spawn 3)
      const fanOut3 = transition({
        ref: 'fanout_3',
        from_node_ref: 'bridge2',
        to_node_ref: 'phase3',
        priority: 1,
        spawn_count: 3,
      });

      // Fan-in #3: phase3 → finalize (collect final arrays)
      const fanIn3 = transition({
        ref: 'fanin_3',
        from_node_ref: 'phase3',
        to_node_ref: 'finalize',
        priority: 1,
        synchronization: {
          strategy: 'all',
          sibling_group: 'fanout_3',
          merge: {
            source: '_branch.output.final',
            target: 'state.pipeline.stages.phase3.results.final',
            strategy: 'collect',
          },
        },
      });

      // =========================================================================
      // Workflow Definition
      // =========================================================================
      const workflowDef = workflow({
        name: 'Deep Nested State Structure Test',
        description: 'Foundation test 05 - three-phase accumulation with deep nesting',
        input_schema: inputSchema,
        output_schema: workflowOutputSchema,
        context_schema: contextSchema,
        output_mapping: {
          seed: '$.state.pipeline.stages.init.config.seed',
          phase1_words: '$.state.pipeline.stages.phase1.results.words',
          phase2_accumulated: '$.state.pipeline.stages.phase2.results.accumulated',
          phase3_final: '$.state.pipeline.stages.phase3.results.final',
        },
        initial_node_ref: 'init',
        nodes: [
          initNode,
          phase1Node,
          bridge1Node,
          phase2Node,
          bridge2Node,
          phase3Node,
          finalizeNode,
        ],
        transitions: [fanOut1, fanIn1, fanOut2, fanIn2, fanOut3, fanIn3],
      });

      // =========================================================================
      // Execute
      // =========================================================================
      const workflowInput = { seed: 'DEEP_NESTED' };
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
            root: 1,
            fanOuts: [
              { count: 3, branchTotal: 3, outputFields: ['word'] },
              { count: 3, branchTotal: 3, outputFields: ['accumulated'] },
              { count: 3, branchTotal: 3, outputFields: ['final'] },
            ],
            fanInArrivals: 9,
            fanInContinuations: 3,
            total: 22,
          })
          .withStateWriteOrder([
            'state.pipeline.stages.init.config.seed',
            'state.pipeline.stages.phase1.results.words',
            'state.pipeline.bridges.bridge1.inherited.words',
            'state.pipeline.stages.phase2.results.accumulated',
            'state.pipeline.bridges.bridge2.inherited.accumulated',
            'state.pipeline.stages.phase3.results.final',
          ])
          .withOutput({
            seed: { type: 'string', defined: true },
            phase1_words: { type: 'array', arrayLength: 3 },
            phase2_accumulated: { type: 'array', arrayLength: 3 },
            phase3_final: { type: 'array', arrayLength: 3 },
          })
          // =====================================================================
          // CRITICAL: Three-phase accumulation verification
          // =====================================================================
          .withCustom('three-phase-accumulation-verification', (_trace, ctx) => {
            const output = ctx.collected.finalOutput as {
              phase1_words: string[];
              phase2_accumulated: string[][];
              phase3_final: string[][][];
            } | null;

            if (!output) {
              throw new Error('No final output found');
            }

            const { phase1_words, phase2_accumulated, phase3_final } = output;

            // =====================================================================
            // 1. Phase 1: 3 words
            // =====================================================================
            if (phase1_words.length !== 3) {
              throw new Error(`Phase 1 should have 3 words, got ${phase1_words.length}`);
            }
            for (const word of phase1_words) {
              if (typeof word !== 'string') {
                throw new Error(`Phase 1 word should be string, got ${typeof word}`);
              }
            }

            // =====================================================================
            // 2. Phase 2: 3 arrays of 4 words each (3 inherited + 1 new)
            // =====================================================================
            if (phase2_accumulated.length !== 3) {
              throw new Error(`Phase 2 should have 3 arrays, got ${phase2_accumulated.length}`);
            }
            for (let i = 0; i < phase2_accumulated.length; i++) {
              const arr = phase2_accumulated[i];
              if (!Array.isArray(arr)) {
                throw new Error(`Phase 2 item ${i} should be array, got ${typeof arr}`);
              }
              if (arr.length !== 4) {
                throw new Error(`Phase 2 array ${i} should have 4 items, got ${arr.length}`);
              }
              // Verify phase1 words are included
              for (const word of phase1_words) {
                if (!arr.includes(word)) {
                  throw new Error(`Phase 2 array ${i} missing phase1 word "${word}"`);
                }
              }
            }

            // =====================================================================
            // 3. Phase 3: 3 arrays of 4 arrays (3 inherited rows + 1 new row)
            // Each inherited row has 4 items, new row has 1 item
            // =====================================================================
            if (phase3_final.length !== 3) {
              throw new Error(`Phase 3 should have 3 outer arrays, got ${phase3_final.length}`);
            }
            for (let i = 0; i < phase3_final.length; i++) {
              const matrix = phase3_final[i];
              if (!Array.isArray(matrix)) {
                throw new Error(`Phase 3 item ${i} should be array, got ${typeof matrix}`);
              }
              // Should have 4 rows: 3 inherited (each with 4 items) + 1 new (with 1 item)
              if (matrix.length !== 4) {
                throw new Error(
                  `Phase 3 matrix ${i} should have 4 rows (3 inherited + 1 new), got ${matrix.length}: ${JSON.stringify(matrix)}`,
                );
              }
              // First 3 rows should have 4 items each (from phase2)
              for (let j = 0; j < 3; j++) {
                const row = matrix[j];
                if (!Array.isArray(row)) {
                  throw new Error(`Phase 3 matrix ${i} row ${j} should be array`);
                }
                if (row.length !== 4) {
                  throw new Error(
                    `Phase 3 matrix ${i} row ${j} should have 4 items, got ${row.length}`,
                  );
                }
              }
              // Last row should have 1 item (the new word)
              const newRow = matrix[3];
              if (!Array.isArray(newRow)) {
                throw new Error(`Phase 3 matrix ${i} row 3 (new row) should be array`);
              }
              if (newRow.length !== 1) {
                throw new Error(
                  `Phase 3 matrix ${i} row 3 (new row) should have 1 item, got ${newRow.length}`,
                );
              }
            }

            // =====================================================================
            // SUCCESS: True accumulation proven across 3 phases
            // Phase 1: string[3]
            // Phase 2: string[3][4]
            // Phase 3: string[3][4][5] (rows, not items)
            // =====================================================================
          })
          .run();
      } finally {
        await cleanup();
      }
    },
  );
});
