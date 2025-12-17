import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertInvariants, runTestWorkflow } from '~/kit';

/**
 * Foundation Test 02: Fan-out with Spawn Count + Fan-in
 *
 * Tests parallel execution via spawn_count on a transition,
 * followed by fan-in synchronization that merges results.
 *
 * Workflow structure:
 *   [nodeA] → (spawn_count: 3) → [nodeB] × 3 → (synchronization) → [nodeC]
 *
 * Data flow:
 *   1. nodeA: Initial execution, sets starter value
 *   2. nodeB ×3: Parallel execution, each writes to isolated branch table
 *   3. Fan-in: Merges branch outputs into context.state.results[]
 *   4. nodeC: Post-merge node, has access to merged results
 *   5. Workflow output: Extracts final merged data
 *
 * This proves:
 * 1. Multiple tokens created from single transition
 * 2. Sibling group structure (shared fan_out_transition_id)
 * 3. Branch table isolation (each token writes to its own table)
 * 4. Fan-in synchronization (strategy: 'all')
 * 5. Branch merge into context.state
 * 6. ACTUAL STATE MUTATION - values flow through and end up in final output
 */

describe('Foundation: 02 - Fan-out with Spawn Count + Fan-in', () => {
  it('executes fan-out, merges results via fan-in, and produces correct final output', async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({
      starter: s.string(),
    });

    // Each node produces a result field
    const nodeOutputSchema = s.object({ result: s.string() }, { required: ['result'] });

    // Workflow context schema defines mutable state
    // The fan-in merge will write branch results to state.results
    const contextSchema = s.object({
      results: s.array(s.string()),
    });

    // Final workflow output extracts the merged results
    const workflowOutputSchema = s.object({
      starter: s.string(),
      merged_results: s.array(s.string()),
    });

    // =========================================================================
    // Workflow Definition
    // =========================================================================

    // Node A: Initial node that triggers fan-out
    const nodeAAction = action({
      name: 'Start Action',
      description: 'Initiates the workflow',
      kind: 'mock',
      implementation: { schema: nodeOutputSchema },
    });

    const nodeAStep = step({
      ref: 'start_step',
      ordinal: 0,
      action: nodeAAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: { 'output.result': '$.result' },
    });

    const nodeATask = task({
      name: 'Start Task',
      description: 'Start task',
      input_schema: s.object({}),
      output_schema: nodeOutputSchema,
      steps: [nodeAStep],
    });

    const nodeA = node({
      ref: 'node_a',
      name: 'Node A',
      task: nodeATask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {},
    });

    // Node B: Executes in parallel (3 times)
    // Each instance writes its result to its isolated branch table
    const nodeBAction = action({
      name: 'Process Action',
      description: 'Processes in parallel',
      kind: 'mock',
      implementation: { schema: nodeOutputSchema },
    });

    const nodeBStep = step({
      ref: 'process_step',
      ordinal: 0,
      action: nodeBAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: { 'output.result': '$.result' },
    });

    const nodeBTask = task({
      name: 'Process Task',
      description: 'Process task',
      input_schema: s.object({}),
      output_schema: nodeOutputSchema,
      steps: [nodeBStep],
    });

    const nodeB = node({
      ref: 'node_b',
      name: 'Node B',
      task: nodeBTask,
      task_version: 1,
      input_mapping: {},
      // Each parallel instance writes to branch table (isolated storage)
      output_mapping: {
        'output.result': '$.result',
      },
    });

    // Node C: Post-merge node
    // Receives merged results from fan-in
    const nodeCAction = action({
      name: 'Collect Action',
      description: 'Collects merged results',
      kind: 'mock',
      implementation: { schema: nodeOutputSchema },
    });

    const nodeCStep = step({
      ref: 'collect_step',
      ordinal: 0,
      action: nodeCAction,
      action_version: 1,
      input_mapping: {},
      output_mapping: { 'output.result': '$.result' },
    });

    const nodeCTask = task({
      name: 'Collect Task',
      description: 'Collect task',
      input_schema: s.object({}),
      output_schema: nodeOutputSchema,
      steps: [nodeCStep],
    });

    const nodeC = node({
      ref: 'node_c',
      name: 'Node C',
      task: nodeCTask,
      task_version: 1,
      input_mapping: {},
      output_mapping: {},
    });

    // Transition: Fan-out from A to B with spawn_count
    const fanOutTransition = transition({
      ref: 'fanout_transition',
      from_node_ref: 'node_a',
      to_node_ref: 'node_b',
      priority: 1,
      spawn_count: 3,
    });

    // Transition: Fan-in from B to C with synchronization
    const fanInTransition = transition({
      ref: 'fanin_transition',
      from_node_ref: 'node_b',
      to_node_ref: 'node_c',
      priority: 1,
      synchronization: {
        strategy: 'all',
        sibling_group: 'fanout_transition', // Wait for all siblings from this fan-out
        merge: {
          source: '_branch.output.result', // Extract result field from each branch output
          target: 'state.results', // Merge branch outputs into state.results[]
          strategy: 'append', // Append each branch result to array
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
        // Pass through input.starter to verify data flow
        starter: '$.input.starter',
        // Extract merged branch results from context
        merged_results: '$.state.results',
      },
      initial_node_ref: 'node_a',
      nodes: [nodeA, nodeB, nodeC],
      transitions: [fanOutTransition, fanInTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const workflowInput = { starter: 'hello-world' };
    const { result, cleanup } = await runTestWorkflow(workflowDef, workflowInput);

    try {
      const { trace } = result;

      // =========================================================================
      // INVARIANTS
      // =========================================================================
      assertInvariants(trace);

      // =========================================================================
      // BASIC VALIDATION
      // =========================================================================
      expect(result.status).toBe('completed');

      // =========================================================================
      // LAYER 0: Verify Workflow Input Arrives in Context
      // =========================================================================
      // Before we can test any state mutations, we must prove the input exists.
      // Context snapshots capture the full context at decision points.
      // The first snapshot should have the workflow input in context.input.

      const snapshots = trace.context.snapshots();
      expect(snapshots.length, 'Must have at least one context snapshot').toBeGreaterThan(0);

      const firstSnapshot = snapshots[0];
      const snapshotInput = firstSnapshot.payload.snapshot.input as Record<string, unknown>;

      const inputDiagnostic = `
INPUT ARRIVAL DIAGNOSTIC:
  Expected input: ${JSON.stringify(workflowInput)}
  Snapshot input: ${JSON.stringify(snapshotInput)}
  Snapshot keys: ${Object.keys(firstSnapshot.payload.snapshot).join(', ')}
`;

      expect(
        snapshotInput.starter,
        `Workflow input.starter should arrive in context.\n${inputDiagnostic}`,
      ).toBe(workflowInput.starter);

      // =========================================================================
      // TOKEN CREATION - Self-Diagnosing Validation
      // =========================================================================
      const tokenCreations = trace.tokens.creations();

      // Build a diagnostic view of all tokens for failure messages
      const tokenDiagnostics = tokenCreations.map((tc) => ({
        token_id: tc.token_id?.slice(-8) ?? 'null', // Last 8 chars for readability
        path_id: tc.payload.path_id,
        parent: tc.payload.parent_token_id?.slice(-8) ?? 'null',
        fan_out_id: tc.payload.fan_out_transition_id?.slice(-8) ?? 'null',
        branch_index: tc.payload.branch_index,
        branch_total: tc.payload.branch_total,
      }));

      // Group tokens by their role in the workflow
      // CRITICAL: Fan-out siblings are the FIRST generation with fan_out_transition_id
      // Their children (at sync points) also inherit fan_out_transition_id but have
      // branch_index=0 because they're not part of a new fan-out
      const rootTokens = tokenCreations.filter((tc) => tc.payload.path_id === 'root');
      const rootTokenId = rootTokens[0]?.token_id;

      // Fan-out siblings: parent is root, have fan_out_transition_id, branch_total=3
      const fanOutSiblings = tokenCreations.filter(
        (tc) =>
          tc.payload.parent_token_id === rootTokenId &&
          tc.payload.fan_out_transition_id !== null &&
          tc.payload.branch_total === 3,
      );
      const siblingIds = new Set(fanOutSiblings.map((s) => s.token_id));

      // Fan-in arrival tokens: parent is a sibling, created when sibling arrives at sync point
      const fanInArrivalTokens = tokenCreations.filter((tc) =>
        siblingIds.has(tc.payload.parent_token_id!),
      );

      // Fan-in continuation: created after sync completes, parent is root, no fan_out_id
      const fanInContinuationTokens = tokenCreations.filter(
        (tc) =>
          tc.payload.parent_token_id === rootTokenId &&
          tc.payload.fan_out_transition_id === null &&
          tc.payload.path_id !== 'root',
      );

      const otherTokens = tokenCreations.filter(
        (tc) =>
          !rootTokens.includes(tc) &&
          !fanOutSiblings.includes(tc) &&
          !fanInArrivalTokens.includes(tc) &&
          !fanInContinuationTokens.includes(tc),
      );

      // EXPECTED TOKEN STRUCTURE:
      // - 1 root token (nodeA)
      // - 3 fan-out siblings (nodeB × 3) - created by spawn_count transition
      // - 3 fan-in arrival tokens (nodeC × 3) - each sibling arrives at sync point
      // - 1 fan-in continuation token (nodeC) - created AFTER sync completes
      //
      // Total = 8 tokens. The fan-in arrival tokens are created when each sibling
      // takes the transition TO the sync node. They wait until sync condition is met.
      const expectedTotal = 1 + 3 + 3 + 1; // root + siblings + arrivals + continuation

      const diagnosticMessage = `
TOKEN CREATION DIAGNOSTIC:
  Total: ${tokenCreations.length} (expected ${expectedTotal})
  
  Root tokens (expected 1): ${rootTokens.length}
  Fan-out siblings (expected 3): ${fanOutSiblings.length}
  Fan-in arrival tokens (expected 3): ${fanInArrivalTokens.length}
  Fan-in continuation (expected 1): ${fanInContinuationTokens.length}
  Other/unexpected: ${otherTokens.length}

  All tokens:
${tokenDiagnostics.map((t) => `    ${t.token_id} | path=${t.path_id} | parent=${t.parent} | fan_out=${t.fan_out_id} | branch=${t.branch_index}/${t.branch_total}`).join('\n')}
`;

      expect(rootTokens.length, `Expected 1 root token.\n${diagnosticMessage}`).toBe(1);
      expect(fanOutSiblings.length, `Expected 3 fan-out siblings.\n${diagnosticMessage}`).toBe(3);
      expect(
        fanInArrivalTokens.length,
        `Expected 3 fan-in arrival tokens.\n${diagnosticMessage}`,
      ).toBe(3);
      expect(
        fanInContinuationTokens.length,
        `Expected 1 fan-in continuation token.\n${diagnosticMessage}`,
      ).toBe(1);
      expect(
        tokenCreations.length,
        `Expected ${expectedTotal} total tokens.\n${diagnosticMessage}`,
      ).toBe(expectedTotal);

      // =========================================================================
      // LAYER 1: Sibling Group Structure (additional validation)
      // =========================================================================

      // The root token and fan-out siblings are already validated above.
      // Now validate the sibling structure details.

      // 1.1: All siblings must share the same fan_out_transition_id
      const fanOutTransitionIds = new Set(
        fanOutSiblings.map((st) => st.payload.fan_out_transition_id),
      );
      expect(fanOutTransitionIds.size, 'All siblings must share same fan_out_transition_id').toBe(
        1,
      );
      const sharedFanOutId = Array.from(fanOutTransitionIds)[0];
      expect(sharedFanOutId, 'fan_out_transition_id must be defined for siblings').toBeDefined();

      // 1.2: Siblings must have branch_index in [0, 1, 2]
      const branchIndices = fanOutSiblings.map((st) => st.payload.branch_index).sort();
      expect(branchIndices, 'branch_index must be [0, 1, 2]').toEqual([0, 1, 2]);

      // 1.3: All siblings must have branch_total = 3
      const branchTotals = new Set(fanOutSiblings.map((st) => st.payload.branch_total));
      expect(branchTotals, 'All siblings must have branch_total=3').toEqual(new Set([3]));

      // 1.6: path_id structure: root.{completed_node_id}.{branch_index}
      // SPEC: path_id tracks execution tree (which nodes were visited)
      //       - First part: parent path ('root')
      //       - Second part: node_id of node that TRIGGERED the fan-out (NOT the transition_id)
      //       - Third part: branch_index
      //
      // This is DISTINCT from fan_out_transition_id which tracks HOW you got here (the transition).
      // path_id = WHERE you are in execution tree (nodes)
      // fan_out_transition_id = WHICH transition created this sibling group
      const pathStructures = fanOutSiblings.map((sibling) => {
        const pathParts = sibling.payload.path_id.split('.');
        return {
          token_id: sibling.token_id,
          path_id: sibling.payload.path_id,
          pathParts,
          branch_index: sibling.payload.branch_index,
          fan_out_transition_id: sibling.payload.fan_out_transition_id,
        };
      });

      // All siblings must have 3-part path structure
      pathStructures.forEach((ps) => {
        expect(
          ps.pathParts.length,
          `path_id must have 3 parts: root.X.branch_index (got: ${ps.path_id})`,
        ).toBe(3);
        expect(ps.pathParts[0], 'First part must be "root"').toBe('root');
        expect(ps.pathParts[2], `Third part must match branch_index=${ps.branch_index}`).toBe(
          String(ps.branch_index),
        );
      });

      // The middle identifier should be consistent across all siblings (they share a fan-out origin)
      const middleParts = new Set(pathStructures.map((ps) => ps.pathParts[1]));
      expect(
        middleParts.size,
        'All siblings must share the same middle identifier in path_id',
      ).toBe(1);

      // =========================================================================
      // LAYER 2: Branch Table Lifecycle (Isolated Storage)
      // =========================================================================

      // SPEC: Each fan-out token gets its own isolated branch table for output storage.
      // This prevents parallel tokens from interfering with each other's state.

      // 2.1: Branch tables must be created for each sibling token
      // Note: token_id is a TOP-LEVEL field on trace events, not in payload
      const branchCreates = trace.branches.creates();
      const siblingTokenIds = new Set(fanOutSiblings.map((st) => st.token_id));

      // Extract token_ids from the TOP LEVEL of events
      const branchTableTokenIds = new Set(branchCreates.map((bc) => bc.token_id));

      // Each sibling should have a branch table created
      fanOutSiblings.forEach((sibling) => {
        expect(
          branchTableTokenIds.has(sibling.token_id),
          `Branch table must be created for sibling token ${sibling.token_id}`,
        ).toBe(true);
      });

      // 2.2: Branch table naming convention
      // SPEC: Tables are named `branch_output_{tokenId}` for clear isolation
      branchCreates.forEach((bc) => {
        if (siblingTokenIds.has(bc.token_id!)) {
          expect(
            bc.payload.table_name,
            `Branch table name must follow pattern branch_output_{tokenId}`,
          ).toBe(`branch_output_${bc.token_id}`);
        }
      });

      // =========================================================================
      // LAYER 3: Branch Writes (Data Flow to Isolated Tables)
      // =========================================================================

      // SPEC: Each token writes its output to its isolated branch table.
      // Mock actions generate deterministic output, so we can verify the data flow.

      // 3.1: Each sibling token must write to its branch table
      // Note: token_id is a TOP-LEVEL field on trace events, not in payload
      const branchWrites = trace.branches.writes();
      const writtenTokenIds = new Set(branchWrites.map((bw) => bw.token_id));

      fanOutSiblings.forEach((sibling) => {
        expect(
          writtenTokenIds.has(sibling.token_id),
          `Sibling token ${sibling.token_id} must write to its branch table`,
        ).toBe(true);
      });

      // 3.2: Verify each branch write has output data with 'result' field
      const siblingBranchOutputs: Array<{ tokenId: string; result: string }> = [];
      branchWrites.forEach((bw) => {
        if (siblingTokenIds.has(bw.token_id!)) {
          expect(bw.payload.output, 'Branch write must contain output data').toBeDefined();
          const output = bw.payload.output as Record<string, unknown>;
          expect(output.result, 'Mock action output must have result field').toBeDefined();
          siblingBranchOutputs.push({
            tokenId: bw.token_id!,
            result: output.result as string,
          });
        }
      });

      // Each sibling token should have at least one branch write
      // NOTE: Multiple writes per token is allowed (step output + node output)
      const uniqueTokensWithWrites = new Set(siblingBranchOutputs.map((bo) => bo.tokenId));

      const branchWriteDiagnostic = `
BRANCH WRITE DIAGNOSTIC:
  Total branch writes: ${branchWrites.length}
  Sibling token IDs we're filtering for: [${Array.from(siblingTokenIds).join(', ')}]
  Branch writes from siblings: ${siblingBranchOutputs.length}
  Unique sibling tokens with writes: ${uniqueTokensWithWrites.size}
  
  All branch writes:
${branchWrites.map((bw) => `    token=${bw.token_id} | in_siblings=${siblingTokenIds.has(bw.token_id!)} | output=${JSON.stringify(bw.payload.output)}`).join('\n')}

  Writes per sibling token:
${Array.from(siblingTokenIds)
  .map((id) => `    ${id}: ${branchWrites.filter((bw) => bw.token_id === id).length} writes`)
  .join('\n')}
`;
      // All 3 sibling tokens must have written to their branch tables
      expect(
        uniqueTokensWithWrites.size,
        `Expected all 3 siblings to write to branch tables.\n${branchWriteDiagnostic}`,
      ).toBe(3);

      // Every sibling must have at least one write
      fanOutSiblings.forEach((sibling) => {
        expect(
          uniqueTokensWithWrites.has(sibling.token_id!),
          `Sibling ${sibling.token_id} must have written to its branch table`,
        ).toBe(true);
      });

      // =========================================================================
      // LAYER 4: Fan-In Synchronization
      // =========================================================================

      // 4.1: Identify the fan-in token (created after all siblings complete)
      const fanInToken = tokenCreations.find((tc) => {
        // Fan-in token is the one NOT in the sibling set and NOT the root
        return tc.token_id !== rootTokenId && !siblingTokenIds.has(tc.token_id);
      });
      expect(fanInToken, 'Should create a fan-in token for node_c').toBeDefined();

      // 4.2: Fan-in token should be at node_c
      // The fan-in token is created when synchronization is satisfied

      // =========================================================================
      // LAYER 5: State Mutation Verification (THE REAL TEST)
      // =========================================================================

      // SPEC: This is what actually validates the system works end-to-end.
      // We verify that:
      // 1. Input value flowed through to state
      // 2. Branch outputs were merged into state
      // 3. Final output contains expected values

      // 5.1: Verify the workflow completed and has final output
      const completion = trace.completion.complete();
      expect(completion, 'Workflow must have completion event').toBeDefined();
      expect(completion!.payload.final_output, 'Completion must have final_output').toBeDefined();

      // Debug: Check what context keys were available at completion time
      const completionStart = trace.completion.start();
      const completionExtracts = trace.filter('decision.completion.extract');

      const finalOutput = completion!.payload.final_output as {
        starter: string;
        merged_results: string[];
      };

      // 5.2: Verify input propagated to output via state.starter
      // The output_mapping extracts $.state.starter to output.starter
      //
      // Context write tracing: Look for what was actually written to state
      const contextWrites = trace.context.setFields();
      const starterWrites = contextWrites.filter((w) => w.payload.path.includes('starter'));

      const stateMutationDiagnostic = `
STATE MUTATION DIAGNOSTIC:
  Final output: ${JSON.stringify(finalOutput)}
  Expected starter: "${workflowInput.starter}"
  Actual starter: ${JSON.stringify(finalOutput.starter)}
  
  All context writes (${contextWrites.length}):
${contextWrites.map((w) => `    path=${w.payload.path} | value=${JSON.stringify(w.payload.value)}`).join('\n')}

  Starter-related writes (${starterWrites.length}):
${starterWrites.map((w) => `    path=${w.payload.path} | value=${JSON.stringify(w.payload.value)}`).join('\n')}
`;
      expect(
        finalOutput.starter,
        `Final output.starter should match input.starter via state mutation.\n${stateMutationDiagnostic}`,
      ).toBe(workflowInput.starter);

      // 5.3: Verify branch merge happened
      // The fan-in merge should collect all branch results into state.results
      // which then gets extracted to output.merged_results
      const mergedResultsDiagnostic = `
MERGED RESULTS DIAGNOSTIC:
  Final output: ${JSON.stringify(finalOutput)}
  merged_results: ${JSON.stringify(finalOutput.merged_results)}
  merged_results type: ${typeof finalOutput.merged_results}
  Is array: ${Array.isArray(finalOutput.merged_results)}
  
COMPLETION DEBUG:
  Context keys at completion: ${JSON.stringify(completionStart?.payload.context_keys)}
  Output mapping: ${JSON.stringify(completionStart?.payload.output_mapping)}
  Extracts: ${JSON.stringify(completionExtracts.map((e) => e.payload))}
`;
      expect(
        Array.isArray(finalOutput.merged_results),
        `Final output.merged_results should be an array.\n${mergedResultsDiagnostic}`,
      ).toBe(true);

      // 5.4: Verify we got all 3 branch results
      expect(
        finalOutput.merged_results,
        'Should have exactly 3 merged results from fan-out',
      ).toHaveLength(3);

      // 5.5: Verify the merged values match the branch outputs
      // The branch outputs are collected from the trace events
      // Note: We dedupe by tokenId since each sibling may have multiple branch writes
      // (step output + node output), but the final result is one per token
      const uniqueBranchResults = new Map<string, string>();
      siblingBranchOutputs.forEach((bo) => {
        uniqueBranchResults.set(bo.tokenId, bo.result);
      });
      const branchResultValues = [...uniqueBranchResults.values()].sort();
      const mergedResultValues = [...finalOutput.merged_results].sort();

      expect(
        mergedResultValues,
        'Merged results should match the values written by each branch',
      ).toEqual(branchResultValues);

      // =========================================================================
      // LAYER 6: Context Write Tracing
      // =========================================================================

      // Verify we can trace the state mutations through context.set events

      // 6.1: Verify state.results was written (by fan-in merge)
      // Note: starter is read from input, not written to state
      const resultsWrite = trace.context.setFieldAt('state.results');
      expect(resultsWrite, 'Should have context write for state.results').toBeDefined();
      const writtenResults = resultsWrite!.payload.value as string[];
      expect(Array.isArray(writtenResults), 'state.results write should be an array').toBe(true);
      expect(writtenResults.length, 'state.results should have 3 merged values').toBe(3);

      // =========================================================================
      // LAYER 7: Context Snapshots (Decision Points)
      // =========================================================================

      // snapshots already declared in Layer 0, reuse it
      expect(snapshots.length, 'Should have context snapshots for decision points').toBeGreaterThan(
        0,
      );

      // Each snapshot must have the expected structure
      snapshots.forEach((snapshot) => {
        expect(snapshot.payload.snapshot, 'Snapshot must have snapshot object').toBeDefined();
        expect(snapshot.payload.snapshot.input, 'Snapshot must have input section').toBeDefined();
        expect(snapshot.payload.snapshot.state, 'Snapshot must have state section').toBeDefined();
        expect(snapshot.payload.snapshot.output, 'Snapshot must have output section').toBeDefined();
      });

      // Find a snapshot that has the merged results (taken after fan-in)
      const postMergeSnapshot = snapshots.find((s) => {
        const state = s.payload.snapshot.state as { results?: string[] };
        return state.results && state.results.length === 3;
      });
      expect(
        postMergeSnapshot,
        'Should have a snapshot capturing the merged state after fan-in',
      ).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});
