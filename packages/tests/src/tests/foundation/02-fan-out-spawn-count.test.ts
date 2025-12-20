import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, it } from 'vitest';
import { assertInvariants, runTestWorkflow, TIME_JITTER, verify } from '~/kit';

/**
 * Foundation Test 02: Fan-out with Spawn Count + Fan-in
 *
 * Tests parallel execution via spawn_count on a transition,
 * followed by fan-in synchronization that merges results.
 *
 * Workflow structure:
 *   [nodeA] → (spawn_count: 3) → [nodeB] × 3 → (synchronization) → [nodeC]
 *
 * Data flow with state transformations:
 *   1. nodeA: Reads input.prefix, writes state.seed (transformed from input)
 *   2. nodeB ×3: Each branch reads state.seed, produces prefixed result
 *   3. Fan-in: Merges branch results into state.results[]
 *   4. nodeC: Reads merged state.results, produces summary, writes state.summary
 *   5. Workflow output: Extracts prefix, seed, results, and summary
 *
 * State mutations traced:
 *   - state.seed: Written by nodeA
 *   - state.results: Written by fan-in merge (array of branch outputs)
 *   - state.summary: Written by nodeC
 *
 * This proves:
 * 1. Multiple tokens created from single transition
 * 2. Sibling group structure (shared fan_out_transition_id)
 * 3. Branch table isolation (each token writes to its own table)
 * 4. Fan-in synchronization (strategy: 'all')
 * 5. Branch merge into context.state
 * 6. ACTUAL STATE MUTATION - values flow through and end up in final output
 * 7. State reads across nodes (nodeB reads state.seed written by nodeA)
 * 8. State write ordering (seed → results → summary)
 */

describe('Foundation: 02 - Fan-out with Spawn Count + Fan-in', () => {
  it('executes fan-out, merges results via fan-in, and produces correct final output', { timeout: 60000 }, async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      prefix: s.string(),
    });

    // Node A produces a seed value derived from input
    const nodeAOutputSchema = s.object({ seed: s.string() }, { required: ['seed'] });

    // Node B produces a result that incorporates the seed
    const nodeBOutputSchema = s.object({ result: s.string() }, { required: ['result'] });

    // Node C produces a summary after seeing merged results
    const nodeCOutputSchema = s.object({ summary: s.string() }, { required: ['summary'] });

    // Workflow context schema defines mutable state
    const contextSchema = s.object({
      seed: s.string(), // Written by nodeA
      results: s.array(s.string()), // Written by fan-in merge
      summary: s.string(), // Written by nodeC
    });

    // Final workflow output extracts multiple state fields
    const workflowOutputSchema = s.object({
      prefix: s.string(), // From input
      seed: s.string(), // From state (written by nodeA)
      merged_results: s.array(s.string()), // From state (written by fan-in)
      summary: s.string(), // From state (written by nodeC)
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================

    // Node A: Initial node that transforms input and writes to state
    const nodeAAction = action({
      name: 'Initialize Action',
      description: 'Transforms input prefix into a seed value',
      kind: 'mock',
      implementation: { schema: nodeAOutputSchema, options: { stringMode: 'words' } },
    });

    const nodeAStep = step({
      ref: 'init_step',
      ordinal: 0,
      action: nodeAAction,
      input_mapping: {},
      output_mapping: { 'output.seed': '$.seed' },
    });

    const nodeATask = task({
      name: 'Initialize Task',
      description: 'Initialize workflow state from input',
      input_schema: s.object({ prefix: s.string() }),
      output_schema: nodeAOutputSchema,
      steps: [nodeAStep],
    });

    const nodeA = node({
      ref: 'node_a',
      name: 'Node A - Initialize',
      task: nodeATask,
      task_version: 1,
      input_mapping: { prefix: '$.input.prefix' },
      output_mapping: { 'state.seed': '$.seed' },
    });

    // Node B: Executes in parallel (3 times)
    // Uses time jitter to test synchronization with out-of-order completion
    const nodeBAction = action({
      name: 'Process Action',
      description: 'Processes in parallel using seed from state',
      kind: 'mock',
      implementation: {
        schema: nodeBOutputSchema,
        options: { stringMode: 'words', delay: TIME_JITTER },
      },
    });

    const nodeBStep = step({
      ref: 'process_step',
      ordinal: 0,
      action: nodeBAction,
      input_mapping: {},
      output_mapping: { 'output.result': '$.result' },
    });

    const nodeBTask = task({
      name: 'Process Task',
      description: 'Process with seed value',
      input_schema: s.object({ seed: s.string() }),
      output_schema: nodeBOutputSchema,
      steps: [nodeBStep],
    });

    const nodeB = node({
      ref: 'node_b',
      name: 'Node B - Process',
      task: nodeBTask,
      task_version: 1,
      input_mapping: { seed: '$.state.seed' },
      output_mapping: { 'output.result': '$.result' },
    });

    // Node C: Post-merge node that reads merged results and produces summary
    const nodeCAction = action({
      name: 'Summarize Action',
      description: 'Summarizes merged results',
      kind: 'mock',
      implementation: { schema: nodeCOutputSchema, options: { stringMode: 'words' } },
    });

    const nodeCStep = step({
      ref: 'summarize_step',
      ordinal: 0,
      action: nodeCAction,
      input_mapping: {},
      output_mapping: { 'output.summary': '$.summary' },
    });

    const nodeCTask = task({
      name: 'Summarize Task',
      description: 'Produce summary from merged results',
      input_schema: s.object({
        results: s.array(s.string()),
      }),
      output_schema: nodeCOutputSchema,
      steps: [nodeCStep],
    });

    const nodeC = node({
      ref: 'node_c',
      name: 'Node C - Summarize',
      task: nodeCTask,
      task_version: 1,
      input_mapping: { results: '$.state.results' },
      output_mapping: { 'state.summary': '$.summary' },
    });

    // Transition: Fan-out from A to B with spawn_count
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      from_node_ref: 'node_a',
      to_node_ref: 'node_b',
      priority: 1,
      spawn_count: 3,
      sibling_group: 'fanout_group', // Explicitly declare sibling group for fan-in coordination
    });

    // Transition: Fan-in from B to C with synchronization
    const fanInTransition = transition({
      ref: 'fanin_transition',
      from_node_ref: 'node_b',
      to_node_ref: 'node_c',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'fanout_group', // References the sibling group declared on fan-out
        merge: {
          source: '_branch.output.result',
          target: 'state.results',
          strategy: 'append',
        },
      },
    });

    const workflowDef = workflow({
      name: 'Fan-out Fan-in Test',
      description: 'Foundation test 02 - fan-out with spawn_count + fan-in synchronization',
      input_schema: inputSchema,
      output_schema: workflowOutputSchema,
      context_schema: contextSchema,
      output_mapping: {
        prefix: '$.input.prefix',
        seed: '$.state.seed',
        merged_results: '$.state.results',
        summary: '$.state.summary',
      },
      initial_node_ref: 'node_a',
      nodes: [nodeA, nodeB, nodeC],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { prefix: 'TEST' };
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
          root: 1,
          fanOuts: [{ count: 3, branchTotal: 3, outputFields: ['result'] }],
          fanInArrivals: 3, // All 3 siblings create arrival tokens (deterministic)
          fanInContinuations: 1, // Single continuation after fan-in activates
          total: 8, // 1 root + 3 fanOut + 3 arrivals + 1 continuation
        })
        .withStateWriteOrder(['state.seed', 'state.results', 'state.summary'])
        .withStateWrites([
          { path: 'state.seed', type: 'string', description: 'Written by nodeA' },
          {
            path: 'state.results',
            type: 'array',
            arrayLength: 3,
            description: 'Written by fan-in',
          },
          { path: 'state.summary', type: 'string', description: 'Written by nodeC' },
        ])
        .withBranchWrites({
          uniqueTokenCount: 3,
        })
        .withOutput({
          prefix: workflowInput.prefix,
          seed: { type: 'string', defined: true },
          merged_results: { type: 'array', arrayLength: 3 },
          summary: { type: 'string', defined: true },
        })
        .withSnapshots({
          minCount: 1,
          withState: {
            field: 'results',
            matcher: (val) => Array.isArray(val) && val.length === 3,
          },
        })
        .run();
  });
});
