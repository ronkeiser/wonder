import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { assertInvariants, runTestWorkflow } from '~/kit';

/**
 * Foundation Test 02: Fan-out with Spawn Count
 *
 * Tests parallel execution via spawn_count on a transition.
 *
 * Workflow structure:
 *   [nodeA] → (spawn_count: 3) → [nodeB] × 3
 *
 * This proves:
 * 1. Multiple tokens created from single transition
 * 2. Sibling group structure (shared fan_out_transition_id)
 * 3. Branch table isolation
 * 4. Parallel execution
 */

describe('Foundation: 02 - Fan-out with Spawn Count', () => {
  it('creates 3 parallel tokens with correct structure', async () => {
    // =========================================================================
    // Schemas
    // =========================================================================
    const inputSchema = s.object({});
    const taskOutputSchema = s.object({ result: s.string() }, { required: ['result'] });
    const workflowOutputSchema = s.object({});

    // =========================================================================
    // Workflow Definition
    // =========================================================================

    // Node A: Initial node that triggers fan-out
    const nodeAAction = action({
      name: 'Start Action',
      description: 'Initiates the workflow',
      kind: 'mock',
      implementation: { schema: taskOutputSchema },
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
      output_schema: taskOutputSchema,
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
    const nodeBAction = action({
      name: 'Process Action',
      description: 'Processes in parallel',
      kind: 'mock',
      implementation: { schema: taskOutputSchema },
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
      output_schema: taskOutputSchema,
      steps: [nodeBStep],
    });

    const nodeB = node({
      ref: 'node_b',
      name: 'Node B',
      task: nodeBTask,
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

    const workflowDef = workflow({
      name: 'Fan-out Spawn Count Test',
      description: 'Foundation test 02 - 3-way fan-out',
      input_schema: inputSchema,
      output_schema: workflowOutputSchema,
      output_mapping: {},
      initial_node_ref: 'node_a',
      nodes: [nodeA, nodeB],
      transitions: [fanOutTransition],
    });

    // =========================================================================
    // Execute
    // =========================================================================
    const { result, cleanup } = await runTestWorkflow(workflowDef, {});

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
      // TOKEN CREATION
      // =========================================================================
      const tokenCreations = trace.tokens.creations();
      expect(tokenCreations, 'Should create 4 tokens: 1 initial + 3 fan-out').toHaveLength(4);

      // =========================================================================
      // LAYER 1: Sibling Group Structure
      // =========================================================================

      // 1.1: Identify the root token
      // SPEC: Initial token has path_id='root' and parent_token_id=null
      const rootToken = tokenCreations.find((tc) => tc.payload.path_id === 'root');
      expect(rootToken, 'Should have root token with path_id="root"').toBeDefined();
      expect(rootToken!.payload.parent_token_id, 'Root token has no parent').toBeNull();
      expect(
        rootToken!.payload.fan_out_transition_id,
        'Root token has no fan_out_transition_id',
      ).toBeNull();
      const rootTokenId = rootToken!.token_id;

      // 1.2: Identify the 3 sibling tokens
      // SPEC: Sibling tokens all share the same parent_token_id (the root token)
      const siblingTokens = tokenCreations.filter(
        (tc) => tc.payload.parent_token_id === rootTokenId,
      );
      expect(siblingTokens, 'Should create exactly 3 sibling tokens').toHaveLength(3);

      // 1.3: All siblings must share the same fan_out_transition_id
      const fanOutTransitionIds = new Set(
        siblingTokens.map((st) => st.payload.fan_out_transition_id),
      );
      expect(fanOutTransitionIds.size, 'All siblings must share same fan_out_transition_id').toBe(
        1,
      );
      const sharedFanOutId = Array.from(fanOutTransitionIds)[0];
      expect(sharedFanOutId, 'fan_out_transition_id must be defined for siblings').toBeDefined();

      // 1.4: Siblings must have branch_index in [0, 1, 2]
      const branchIndices = siblingTokens.map((st) => st.payload.branch_index).sort();
      expect(branchIndices, 'branch_index must be [0, 1, 2]').toEqual([0, 1, 2]);

      // 1.5: All siblings must have branch_total = 3
      const branchTotals = new Set(siblingTokens.map((st) => st.payload.branch_total));
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
      const pathStructures = siblingTokens.map((sibling) => {
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
      const siblingTokenIds = new Set(siblingTokens.map((st) => st.token_id));

      // Extract token_ids from the TOP LEVEL of events
      const branchTableTokenIds = new Set(branchCreates.map((bc) => bc.token_id));

      // Each sibling should have a branch table created
      siblingTokens.forEach((sibling) => {
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

      siblingTokens.forEach((sibling) => {
        expect(
          writtenTokenIds.has(sibling.token_id),
          `Sibling token ${sibling.token_id} must write to its branch table`,
        ).toBe(true);
      });

      // 3.2: Verify each branch write has output data
      branchWrites.forEach((bw) => {
        if (siblingTokenIds.has(bw.token_id!)) {
          expect(bw.payload.output, 'Branch write must contain output data').toBeDefined();
          // Mock action output follows schema, should have 'result' field
          expect(
            (bw.payload.output as Record<string, unknown>).result,
            'Mock action output must have result field',
          ).toBeDefined();
        }
      });

      // =========================================================================
      // LAYER 4: Context Snapshots (Decision Points)
      // =========================================================================

      // SPEC: Context snapshots are captured at routing decision points,
      // providing observability into state at each decision.

      const snapshots = trace.context.snapshots();
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
    } finally {
      await cleanup();
    }
  });
});
