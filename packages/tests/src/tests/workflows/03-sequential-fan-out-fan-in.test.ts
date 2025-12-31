import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, TIME_JITTER, verify } from '~/kit';

/**
 * Foundation Test 03: Sequential Fan-out/Fan-in with State Propagation
 *
 * Tests two sequential fan-out/fan-in phases where aggregated state
 * from the first phase propagates to the second phase.
 *
 * Workflow structure:
 *   [init] → (spawn 3) → [phase1] ×3 → (fan-in: merge) →
 *   [bridge] → (spawn 3) → [phase2] ×3 → (fan-in: merge) → [summarize]
 *
 * Data flow:
 *   1. init: Writes state.seed
 *   2. phase1 ×3: Each reads state.seed, produces phase1 output
 *   3. Fan-in #1: Merges branch outputs into state.phase1_results[]
 *   4. bridge: Reads state.phase1_results, writes state.phase1_count
 *   5. phase2 ×3: Each reads state.phase1_results AND state.phase1_count
 *   6. Fan-in #2: Merges branch outputs into state.phase2_results[]
 *   7. summarize: Reads both result arrays, produces final summary
 *
 * This proves:
 * 1. Sequential fan-out/fan-in patterns work correctly
 * 2. Aggregated state from fan-in #1 is available to fan-out #2
 * 3. Multiple synchronization points in a single workflow
 * 4. State accumulates correctly across phases
 * 5. Branch indices reset for second fan-out
 */

describe('Foundation: 03 - Sequential Fan-out/Fan-in', () => {
  it('executes two fan-out/fan-in phases with state propagation', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      seed: s.string(),
    });

    const initOutputSchema = s.object({ seed: s.string() }, { required: ['seed'] });

    const phase1OutputSchema = s.object({ value: s.string() }, { required: ['value'] });

    const bridgeOutputSchema = s.object({ count: s.number() }, { required: ['count'] });

    const phase2OutputSchema = s.object({ transformed: s.string() }, { required: ['transformed'] });

    const summarizeOutputSchema = s.object({ summary: s.string() }, { required: ['summary'] });

    const contextSchema = s.object({
      seed: s.string(),
      phase1_results: s.array(s.string()),
      phase1_count: s.number(),
      phase2_results: s.array(s.string()),
      summary: s.string(),
    });

    const workflowOutputSchema = s.object({
      seed: s.string(),
      phase1_results: s.array(s.string()),
      phase1_count: s.number(),
      phase2_results: s.array(s.string()),
      summary: s.string(),
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
      outputMapping: { 'state.seed': 'result.seed' },
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
      inputMapping: { seed: 'state.seed' },
      outputMapping: { 'output.value': 'result.value' },
    });

    // =========================================================================
    // Node: bridge (between fan-in #1 and fan-out #2)
    // =========================================================================
    const bridgeAction = action({
      name: 'Bridge Action',
      description: 'Bridge between phases - counts phase 1 results',
      kind: 'mock',
      implementation: { schema: bridgeOutputSchema, options: { stringMode: 'words' } },
    });

    const bridgeStep = step({
      ref: 'bridge_step',
      ordinal: 0,
      action: bridgeAction,
      inputMapping: {},
      outputMapping: { 'output.count': 'result.count' },
    });

    const bridgeTask = task({
      name: 'Bridge Task',
      description: 'Bridge processing',
      inputSchema: s.object({ phase1_results: s.array(s.string()) }),
      outputSchema: bridgeOutputSchema,
      steps: [bridgeStep],
    });

    const bridgeNode = node({
      ref: 'bridge',
      name: 'Bridge',
      task: bridgeTask,
      taskVersion: 1,
      inputMapping: { phase1_results: 'state.phase1_results' },
      outputMapping: { 'state.phase1_count': 'result.count' },
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
        options: { stringMode: 'words', delay: TIME_JITTER },
      },
    });

    const phase2Step = step({
      ref: 'phase2_step',
      ordinal: 0,
      action: phase2Action,
      inputMapping: {},
      outputMapping: { 'output.transformed': 'result.transformed' },
    });

    const phase2Task = task({
      name: 'Phase 2 Task',
      description: 'Process in phase 2 using phase 1 results',
      inputSchema: s.object({
        phase1_results: s.array(s.string()),
        phase1_count: s.number(),
      }),
      outputSchema: phase2OutputSchema,
      steps: [phase2Step],
    });

    const phase2Node = node({
      ref: 'phase2',
      name: 'Phase 2',
      task: phase2Task,
      taskVersion: 1,
      inputMapping: {
        phase1_results: 'state.phase1_results',
        phase1_count: 'state.phase1_count',
      },
      outputMapping: { 'output.transformed': 'result.transformed' },
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
      ref: 'summarizeStep',
      ordinal: 0,
      action: summarizeAction,
      inputMapping: {},
      outputMapping: { 'output.summary': 'result.summary' },
    });

    const summarizeTask = task({
      name: 'Summarize Task',
      description: 'Produce final summary',
      inputSchema: s.object({
        phase1_results: s.array(s.string()),
        phase2_results: s.array(s.string()),
      }),
      outputSchema: summarizeOutputSchema,
      steps: [summarizeStep],
    });

    const summarizeNode = node({
      ref: 'summarize',
      name: 'Summarize',
      task: summarizeTask,
      taskVersion: 1,
      inputMapping: {
        phase1_results: 'state.phase1_results',
        phase2_results: 'state.phase2_results',
      },
      outputMapping: { 'state.summary': 'result.summary' },
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

    // Fan-in #1: phase1 → bridge (synchronize all phase1 branches)
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
          target: 'state.phase1_results',
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

    // Fan-in #2: phase2 → summarize (synchronize all phase2 branches)
    const fanIn2 = transition({
      ref: 'fanin_2',
      fromNodeRef: 'phase2',
      toNodeRef: 'summarize',
      priority: 1,
      synchronization: {
        strategy: 'all',
        siblingGroup: 'phase2_group',
        merge: {
          source: '_branch.output.transformed',
          target: 'state.phase2_results',
          strategy: 'append',
        },
      },
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================
    const workflowDef = workflow({
      name: 'Sequential Fan-out/Fan-in Test',
      description: 'Foundation test 03 - two sequential fan-out/fan-in phases',
      inputSchema: inputSchema,
      outputSchema: workflowOutputSchema,
      contextSchema: contextSchema,
      outputMapping: {
        seed: 'state.seed',
        phase1_results: 'state.phase1_results',
        phase1_count: 'state.phase1_count',
        phase2_results: 'state.phase2_results',
        summary: 'state.summary',
      },
      initialNodeRef: 'init',
      nodes: [initNode, phase1Node, bridgeNode, phase2Node, summarizeNode],
      transitions: [fanOut1, fanIn1, fanOut2, fanIn2],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { seed: 'ALPHA' };
    const { result } = await runTestWorkflow(workflowDef, workflowInput);

    const { trace } = result;

      // =========================================================================
      // INVARIANTS
      // =========================================================================
      assertInvariants(trace);

      // =========================================================================
      // VERIFICATION
      // =========================================================================
      verify(trace, { input: workflowInput, definition: workflowDef })
        .completed()
        .withTokens({
          // Token structure for two sequential fan-out/fan-ins:
          // - 1 root token (init)
          // - 3 phase1 tokens (fan-out #1)
          // - 3 fan-in arrival tokens (all siblings create arrivals - deterministic)
          // - 1 bridge continuation token (after fan-in #1 completes)
          // - 3 phase2 tokens (fan-out #2)
          // - 3 fan-in arrival tokens (all siblings create arrivals - deterministic)
          // - 1 summarize continuation token (after fan-in #2 completes)
          // Total: 1 + 3 + 3 + 1 + 3 + 3 + 1 = 15
          root: 1,
          fanOuts: [
            { count: 3, branchTotal: 3, outputFields: ['value'] },
            { count: 3, branchTotal: 3, outputFields: ['transformed'] },
          ],
          fanInArrivals: 6, // 3 for fanIn1 + 3 for fanIn2 (deterministic)
          fanInContinuations: 2, // 1 for bridge + 1 for summarize
          total: 15,
        })
        .withStateWriteOrder([
          'state.seed',
          'state.phase1_results',
          'state.phase1_count',
          'state.phase2_results',
          'state.summary',
        ])
        .withStateWrites([
          { path: 'state.seed', type: 'string', description: 'Written by init' },
          {
            path: 'state.phase1_results',
            type: 'array',
            arrayLength: 3,
            description: 'Written by fan-in #1',
          },
          { path: 'state.phase1_count', type: 'number', description: 'Written by bridge' },
          {
            path: 'state.phase2_results',
            type: 'array',
            arrayLength: 3,
            description: 'Written by fan-in #2',
          },
          { path: 'state.summary', type: 'string', description: 'Written by summarize' },
        ])
        .withBranchWrites({
          uniqueTokenCount: 6, // 3 phase1 + 3 phase2 branches
        })
        .withOutput({
          seed: { type: 'string', defined: true },
          phase1_results: { type: 'array', arrayLength: 3 },
          phase1_count: { type: 'number', defined: true },
          phase2_results: { type: 'array', arrayLength: 3 },
          summary: { type: 'string', defined: true },
        })
        .withSnapshots({
          minCount: 2, // At least one snapshot per phase
        })
        .run();
  });
});
