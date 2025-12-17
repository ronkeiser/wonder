/**
 * Unit tests for workflow-defs transformer
 *
 * Critical test: synchronization.sibling_group ref → ID transformation
 */

import { describe, expect, it } from 'vitest';
import {
  generateIds,
  transformWorkflowDef,
} from '../../../src/resources/workflow-defs/transformer';
import type { WorkflowDefInput } from '../../../src/resources/workflow-defs/validator';

describe('transformer', () => {
  describe('generateIds', () => {
    it('generates unique IDs for workflow, nodes, and transitions with refs', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'end', name: 'End' },
        ],
        transitions: [
          { ref: 'start-to-end', from_node_ref: 'start', to_node_ref: 'end', priority: 0 },
        ],
      };

      const ids = generateIds(input);

      expect(ids.workflowDefId).toBeTruthy();
      expect(ids.nodeIds.get('start')).toBeTruthy();
      expect(ids.nodeIds.get('end')).toBeTruthy();
      expect(ids.transitionIds.get('start-to-end')).toBeTruthy();

      // All IDs should be unique
      const allIds = [
        ids.workflowDefId,
        ids.nodeIds.get('start'),
        ids.nodeIds.get('end'),
        ids.transitionIds.get('start-to-end'),
      ];
      expect(new Set(allIds).size).toBe(4);
    });

    it('does not generate IDs for transitions without refs', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'end', name: 'End' },
        ],
        transitions: [
          { from_node_ref: 'start', to_node_ref: 'end', priority: 0 }, // No ref
        ],
      };

      const ids = generateIds(input);

      expect(ids.transitionIds.size).toBe(0);
    });
  });

  describe('transformWorkflowDef', () => {
    it('resolves initial_node_ref to initial_node_id', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [{ ref: 'start', name: 'Start' }],
        transitions: [],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      expect(result.initialNodeId).toBe(ids.nodeIds.get('start'));
    });

    it('transforms node refs to node IDs', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [
          { ref: 'start', name: 'Start Node' },
          { ref: 'end', name: 'End Node' },
        ],
        transitions: [],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe(ids.nodeIds.get('start'));
      expect(result.nodes[0].ref).toBe('start');
      expect(result.nodes[0].name).toBe('Start Node');
      expect(result.nodes[1].id).toBe(ids.nodeIds.get('end'));
    });

    it('transforms transition from_node_ref and to_node_ref to IDs', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'end', name: 'End' },
        ],
        transitions: [{ ref: 'go', from_node_ref: 'start', to_node_ref: 'end', priority: 0 }],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0].from_node_id).toBe(ids.nodeIds.get('start'));
      expect(result.transitions[0].to_node_id).toBe(ids.nodeIds.get('end'));
    });
  });

  describe('synchronization.sibling_group ref → ID transformation', () => {
    /**
     * CRITICAL TEST: This is the core behavior being verified.
     *
     * Fan-out/fan-in pattern:
     * - fan-out transition spawns multiple parallel activations (spawn_count: 3)
     * - fan-in transition waits for all spawned activations to complete
     * - fan-in references fan-out via sibling_group
     *
     * At authoring time: sibling_group = "fan-out" (the ref)
     * At runtime: sibling_group must be the ULID of the fan-out transition
     */
    it('transforms sibling_group from ref to transition ID', () => {
      const input: WorkflowDefInput = {
        name: 'fan-out-fan-in-workflow',
        description: 'Parallel processing with synchronization',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'parallel-task', name: 'Parallel Task' },
          { ref: 'collect', name: 'Collect Results' },
        ],
        transitions: [
          {
            ref: 'fan-out',
            from_node_ref: 'start',
            to_node_ref: 'parallel-task',
            priority: 0,
            spawn_count: 3, // Creates 3 parallel activations
          },
          {
            ref: 'fan-in',
            from_node_ref: 'parallel-task',
            to_node_ref: 'collect',
            priority: 0,
            synchronization: {
              strategy: 'wait_all',
              sibling_group: 'fan-out', // <-- This is a REF at authoring time
              merge: { strategy: 'array' },
            },
          },
        ],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      // Find the fan-in transition
      const fanInTransition = result.transitions.find((t) => t.ref === 'fan-in');
      expect(fanInTransition).toBeDefined();
      expect(fanInTransition!.synchronization).not.toBeNull();

      // The critical assertion: sibling_group should now be the ID, not the ref
      const fanOutId = ids.transitionIds.get('fan-out');
      expect(fanOutId).toBeTruthy();
      expect(fanInTransition!.synchronization!.sibling_group).toBe(fanOutId);

      // Verify it's NOT the ref string
      expect(fanInTransition!.synchronization!.sibling_group).not.toBe('fan-out');

      // Verify it looks like a ULID (26 chars, alphanumeric)
      expect(fanInTransition!.synchronization!.sibling_group).toMatch(/^[0-9A-Z]{26}$/);
    });

    it('preserves other synchronization fields during transformation', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'a',
        nodes: [
          { ref: 'a', name: 'A' },
          { ref: 'b', name: 'B' },
          { ref: 'c', name: 'C' },
        ],
        transitions: [
          { ref: 'spawn', from_node_ref: 'a', to_node_ref: 'b', priority: 0, spawn_count: 5 },
          {
            ref: 'join',
            from_node_ref: 'b',
            to_node_ref: 'c',
            priority: 0,
            synchronization: {
              strategy: 'wait_first',
              sibling_group: 'spawn',
              merge: { strategy: 'first_success', timeout_ms: 5000 },
            },
          },
        ],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      const joinTransition = result.transitions.find((t) => t.ref === 'join');
      expect(joinTransition!.synchronization).toEqual({
        strategy: 'wait_first',
        sibling_group: ids.transitionIds.get('spawn'), // ID, not ref
        merge: { strategy: 'first_success', timeout_ms: 5000 },
      });
    });

    it('handles transitions without synchronization (returns null)', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'end', name: 'End' },
        ],
        transitions: [{ ref: 'simple', from_node_ref: 'start', to_node_ref: 'end', priority: 0 }],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      expect(result.transitions[0].synchronization).toBeNull();
    });

    it('throws if sibling_group ref is not in transition map', () => {
      // This simulates a bug where validation passed but transformer fails
      // In practice, validator.ts should catch this first
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'a',
        nodes: [
          { ref: 'a', name: 'A' },
          { ref: 'b', name: 'B' },
        ],
        transitions: [
          {
            ref: 'bad-sync',
            from_node_ref: 'a',
            to_node_ref: 'b',
            priority: 0,
            synchronization: {
              strategy: 'wait_all',
              sibling_group: 'nonexistent', // References a transition that doesn't exist
            },
          },
        ],
      };

      const ids = generateIds(input);

      expect(() => transformWorkflowDef(input, ids)).toThrow(
        /sibling_group ref 'nonexistent' not found/,
      );
    });
  });

  describe('edge cases', () => {
    it('handles workflow with no transitions', () => {
      const input: WorkflowDefInput = {
        name: 'single-node',
        description: 'Just one node',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'only',
        nodes: [{ ref: 'only', name: 'Only Node' }],
        transitions: [],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      expect(result.transitions).toHaveLength(0);
      expect(result.nodes).toHaveLength(1);
    });

    it('generates new ID for transitions without refs', () => {
      const input: WorkflowDefInput = {
        name: 'test-workflow',
        description: 'Test',
        project_id: 'proj-1',
        input_schema: {},
        output_schema: {},
        initial_node_ref: 'start',
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'end', name: 'End' },
        ],
        transitions: [
          { from_node_ref: 'start', to_node_ref: 'end', priority: 0 }, // No ref
        ],
      };

      const ids = generateIds(input);
      const result = transformWorkflowDef(input, ids);

      // Should still have an ID even without a ref
      expect(result.transitions[0].id).toBeTruthy();
      expect(result.transitions[0].id).toMatch(/^[0-9A-Z]{26}$/);
      expect(result.transitions[0].ref).toBeNull();
    });
  });
});
