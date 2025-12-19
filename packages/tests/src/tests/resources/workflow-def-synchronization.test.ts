import { action, node, schema as s, step, task, transition, workflow } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { wonder } from '~/client';
import { cleanupTestContext, createWorkflow, setupTestContext } from '~/kit';

/**
 * Workflow Definition Synchronization Test
 *
 * Tests that synchronization.sibling_group refs are properly transformed to IDs
 * when creating workflow definitions.
 *
 * This validates the critical ref→ID transformation that happens in:
 * - validator.ts: validates sibling_group refs point to valid transitions
 * - transformer.ts: converts sibling_group from ref string to transition ULID
 *
 * Workflow structure:
 *   [start] --(spawn_count: 3, ref: "fan-out")--> [parallel] --(sync: sibling_group: "fan-out")--> [collect]
 *
 * This proves:
 * 1. Workflow def creation accepts sibling_group as a ref
 * 2. After creation, sibling_group is stored as the transition's ID (ULID)
 * 3. The ref→ID transformation is consistent and round-trips correctly
 */
describe('WorkflowDef - Synchronization Ref→ID Transformation', () => {
  it('transforms sibling_group ref to transition ID on create', async () => {
    // =========================================================================
    // Setup - Create minimal test context
    // =========================================================================
    const ctx = await setupTestContext();

    try {
      // =======================================================================
      // Build workflow with fan-out/fan-in pattern
      // =======================================================================
      const noopAction = action({
        name: 'No-op Action',
        description: 'Does nothing',
        kind: 'update_context',
        implementation: {},
      });

      const noopStep = step({
        ref: 'noop',
        ordinal: 0,
        action: noopAction,
        input_mapping: {},
        output_mapping: {},
      });

      const noopTask = task({
        name: 'No-op Task',
        description: 'Does nothing',
        input_schema: s.object({}),
        output_schema: s.object({}),
        steps: [noopStep],
      });

      const startNode = node({
        ref: 'start',
        name: 'Start',
        task: noopTask,
        task_version: 1,
        input_mapping: {},
        output_mapping: {},
      });

      const parallelNode = node({
        ref: 'parallel',
        name: 'Parallel Worker',
        task: noopTask,
        task_version: 1,
        input_mapping: {},
        output_mapping: {},
      });

      const collectNode = node({
        ref: 'collect',
        name: 'Collector',
        task: noopTask,
        task_version: 1,
        input_mapping: {},
        output_mapping: {},
      });

      // KEY: Fan-out transition with ref
      const fanOutTransition = transition({
        ref: 'fan_out', // <-- This is the ref that sibling_group will reference
        from_node_ref: 'start',
        to_node_ref: 'parallel',
        priority: 1,
        spawn_count: 3,
      });

      // KEY: Fan-in transition with synchronization.sibling_group
      const fanInTransition = transition({
        ref: 'fan_in',
        from_node_ref: 'parallel',
        to_node_ref: 'collect',
        priority: 1,
        synchronization: {
          strategy: 'all',
          sibling_group: 'fan_out', // <-- Ref at authoring time, should become ID in DB
          merge: {
            source: '_branch.output',
            target: 'output.results',
            strategy: 'append',
          },
        },
      });

      const testWorkflow = workflow({
        name: `Sync Ref→ID Test ${Date.now()}`,
        description: 'Tests sibling_group ref to ID transformation',
        input_schema: s.object({}),
        output_schema: s.object({}),
        output_mapping: {},
        initial_node_ref: 'start',
        nodes: [startNode, parallelNode, collectNode],
        transitions: [fanOutTransition, fanInTransition],
      });

      // =======================================================================
      // Create workflow definition
      // =======================================================================
      console.log('\n🔧 Creating workflow definition...');
      const setup = await createWorkflow(ctx, testWorkflow);

      // =======================================================================
      // Fetch the created workflow definition and verify transformation
      // =======================================================================
      console.log('🔍 Fetching workflow definition to verify transformation...');
      const fetchedDef = await wonder.workflowDefs(setup.workflowDefId).get();

      console.log('\n📋 Workflow Definition Response:');
      console.log(`   workflow_def_id: ${fetchedDef.workflow_def.id}`);
      console.log(`   nodes: ${fetchedDef.nodes.length}`);
      console.log(`   transitions: ${fetchedDef.transitions.length}`);

      // =======================================================================
      // Find the transitions by ref
      // =======================================================================
      const fanOut = fetchedDef.transitions.find((t) => t.ref === 'fan_out');
      const fanIn = fetchedDef.transitions.find((t) => t.ref === 'fan_in');

      expect(fanOut).toBeDefined();
      expect(fanIn).toBeDefined();
      console.log('\n✓ Found both fan_out and fan_in transitions');

      console.log(`\n📊 Transition IDs:`);
      console.log(`   fan_out.id: ${fanOut!.id}`);
      console.log(`   fan_in.id: ${fanIn!.id}`);

      // =======================================================================
      // CRITICAL ASSERTION: sibling_group should be the fan-out transition's ID
      // =======================================================================
      const syncConfig = fanIn!.synchronization as {
        strategy: string;
        sibling_group: string;
        merge?: object;
      };

      expect(syncConfig).toBeDefined();
      expect(syncConfig.sibling_group).toBeDefined();

      console.log(`\n🔑 Synchronization config:`);
      console.log(`   strategy: ${syncConfig.strategy}`);
      console.log(`   sibling_group: ${syncConfig.sibling_group}`);
      console.log(`   expected (fan-out ID): ${fanOut!.id}`);

      // The sibling_group should be the ID, NOT the ref
      expect(syncConfig.sibling_group).toBe(fanOut!.id);
      expect(syncConfig.sibling_group).not.toBe('fan_out');

      // Verify it's a ULID format (26 uppercase alphanumeric chars)
      expect(syncConfig.sibling_group).toMatch(/^[0-9A-Z]{26}$/);

      console.log('\n✅ sibling_group correctly transformed from ref to ID');

      // =======================================================================
      // Verify other synchronization fields preserved
      // =======================================================================
      expect(syncConfig.strategy).toBe('all');
      expect(syncConfig.merge).toEqual({
        source: '_branch.output',
        target: 'output.results',
        strategy: 'append',
      });
      console.log('✅ Other synchronization fields preserved correctly');

      // =======================================================================
      // Verify spawn_count on fan-out transition
      // =======================================================================
      expect(fanOut!.spawn_count).toBe(3);
      console.log('✅ spawn_count preserved correctly');

      console.log('\n🎉 All assertions passed - ref→ID transformation verified\n');

      // =======================================================================
      // Cleanup (in correct order to avoid foreign key issues)
      // =======================================================================
      console.log('🧹 Cleaning up...');

      // Delete workflow first (references workflow_def)
      try {
        await wonder.workflows(setup.workflowId).delete();
      } catch (e) {
        console.warn('Failed to delete workflow:', e);
      }

      // Delete workflow def (references task_defs via nodes)
      try {
        await wonder.workflowDefs(setup.workflowDefId).delete();
      } catch (e) {
        console.warn('Failed to delete workflow def:', e);
      }

      // Delete tasks (references actions via steps)
      for (const taskId of setup.createdResources.taskIds.reverse()) {
        try {
          await wonder.tasks(taskId).delete();
        } catch (e) {
          console.warn('Failed to delete task:', e);
        }
      }

      // Delete actions
      for (const actionId of setup.createdResources.actionIds.reverse()) {
        try {
          await wonder.actions(actionId).delete();
        } catch (e) {
          console.warn('Failed to delete action:', e);
        }
      }
    } finally {
      // Clean up base infrastructure (model profile, project, workspace)
      try {
        await cleanupTestContext(ctx);
      } catch (e) {
        console.warn('Failed to cleanup test context:', e);
      }
    }
  });
});
