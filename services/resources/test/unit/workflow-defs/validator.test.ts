/**
 * Unit tests for workflow-defs validator
 *
 * Tests validation of synchronization.siblingGroup refs
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/errors';
import {
  validateWorkflowDef,
  type WorkflowDefInput,
} from '../../../src/resources/workflow-defs/validator';

/** Helper to create a minimal valid workflow input */
function createValidInput(overrides: Partial<WorkflowDefInput> = {}): WorkflowDefInput {
  return {
    name: 'test-workflow',
    description: 'Test workflow',
    project_id: 'proj-1',
    input_schema: {},
    output_schema: {},
    initial_node_ref: 'start',
    nodes: [
      { ref: 'start', name: 'Start' },
      { ref: 'end', name: 'End' },
    ],
    transitions: [{ fromNodeRef: 'start', toNodeRef: 'end', priority: 0 }],
    ...overrides,
  };
}

describe('validateWorkflowDef', () => {
  describe('basic validation', () => {
    it('accepts valid workflow definition', () => {
      const input = createValidInput();
      const result = validateWorkflowDef(input);

      expect(result.nodeRefs).toContain('start');
      expect(result.nodeRefs).toContain('end');
    });

    it('returns collected refs for transformer use', () => {
      const input = createValidInput({
        transitions: [{ ref: 'go', fromNodeRef: 'start', toNodeRef: 'end', priority: 0 }],
      });
      const result = validateWorkflowDef(input);

      expect(result.nodeRefs.size).toBe(2);
      expect(result.transitionRefs.has('go')).toBe(true);
    });
  });

  describe('node ref validation', () => {
    it('rejects duplicate node refs', () => {
      const input = createValidInput({
        nodes: [
          { ref: 'same', name: 'First' },
          { ref: 'same', name: 'Second' },
        ],
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(/Duplicate node ref: same/);
    });
  });

  describe('transition ref validation', () => {
    it('rejects duplicate transition refs', () => {
      const input = createValidInput({
        transitions: [
          { ref: 'dup', fromNodeRef: 'start', toNodeRef: 'end', priority: 0 },
          { ref: 'dup', fromNodeRef: 'start', toNodeRef: 'end', priority: 1 },
        ],
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(/Duplicate transition ref: dup/);
    });

    it('allows transitions without refs', () => {
      const input = createValidInput({
        transitions: [
          { fromNodeRef: 'start', toNodeRef: 'end', priority: 0 },
          { fromNodeRef: 'start', toNodeRef: 'end', priority: 1 },
        ],
      });

      expect(() => validateWorkflowDef(input)).not.toThrow();
    });
  });

  describe('transition node ref validation', () => {
    it('rejects invalid fromNodeRef', () => {
      const input = createValidInput({
        transitions: [{ fromNodeRef: 'nonexistent', toNodeRef: 'end', priority: 0 }],
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(/Invalid fromNodeRef: nonexistent/);
    });

    it('rejects invalid toNodeRef', () => {
      const input = createValidInput({
        transitions: [{ fromNodeRef: 'start', toNodeRef: 'nonexistent', priority: 0 }],
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(/Invalid toNodeRef: nonexistent/);
    });
  });

  describe('initial_node_ref validation', () => {
    it('rejects invalid initial_node_ref', () => {
      const input = createValidInput({
        initial_node_ref: 'nonexistent',
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(/Invalid initial_node_ref: nonexistent/);
    });
  });

  describe('ownership validation', () => {
    it('rejects when neither project_id nor library_id is set', () => {
      const input = createValidInput({
        project_id: undefined,
        library_id: undefined,
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(
        /Either project_id or library_id must be provided/,
      );
    });

    it('rejects when both project_id and library_id are set', () => {
      const input = createValidInput({
        project_id: 'proj-1',
        library_id: 'lib-1',
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(
        /Cannot specify both project_id and library_id/,
      );
    });

    it('accepts project_id only', () => {
      const input = createValidInput({
        project_id: 'proj-1',
        library_id: undefined,
      });

      expect(() => validateWorkflowDef(input)).not.toThrow();
    });

    it('accepts library_id only', () => {
      const input = createValidInput({
        project_id: undefined,
        library_id: 'lib-1',
      });

      expect(() => validateWorkflowDef(input)).not.toThrow();
    });
  });

  describe('synchronization.siblingGroup validation', () => {
    /**
     * CRITICAL: siblingGroup must reference a valid transition ref
     *
     * This validation ensures that at transformation time, the ref
     * can be resolved to a transition ID.
     */
    it('accepts valid siblingGroup ref', () => {
      const input = createValidInput({
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'parallel', name: 'Parallel' },
          { ref: 'collect', name: 'Collect' },
        ],
        transitions: [
          {
            ref: 'fan-out',
            fromNodeRef: 'start',
            toNodeRef: 'parallel',
            priority: 0,
            spawnCount: 3,
          },
          {
            ref: 'fan-in',
            fromNodeRef: 'parallel',
            toNodeRef: 'collect',
            priority: 0,
            synchronization: {
              strategy: 'wait_all',
              siblingGroup: 'fan-out', // Valid - references 'fan-out' transition
            },
          },
        ],
      });

      expect(() => validateWorkflowDef(input)).not.toThrow();
    });

    it('rejects invalid siblingGroup ref', () => {
      const input = createValidInput({
        nodes: [
          { ref: 'start', name: 'Start' },
          { ref: 'end', name: 'End' },
        ],
        transitions: [
          {
            ref: 'bad-sync',
            fromNodeRef: 'start',
            toNodeRef: 'end',
            priority: 0,
            synchronization: {
              strategy: 'wait_all',
              siblingGroup: 'nonexistent', // Invalid - no such transition
            },
          },
        ],
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(
        /Invalid synchronization.siblingGroup: 'nonexistent'/,
      );
    });

    it('rejects siblingGroup referencing a transition without a ref', () => {
      // Edge case: if transition has no ref, it can't be referenced
      const input = createValidInput({
        initial_node_ref: 'a', // Must match a valid node
        nodes: [
          { ref: 'a', name: 'A' },
          { ref: 'b', name: 'B' },
          { ref: 'c', name: 'C' },
        ],
        transitions: [
          {
            // No ref! Can't be referenced by siblingGroup
            fromNodeRef: 'a',
            toNodeRef: 'b',
            priority: 0,
            spawnCount: 3,
          },
          {
            ref: 'join',
            fromNodeRef: 'b',
            toNodeRef: 'c',
            priority: 0,
            synchronization: {
              strategy: 'wait_all',
              siblingGroup: 'spawn', // Invalid - 'spawn' doesn't exist as a ref
            },
          },
        ],
      });

      expect(() => validateWorkflowDef(input)).toThrow(ValidationError);
      expect(() => validateWorkflowDef(input)).toThrow(
        /Invalid synchronization.siblingGroup: 'spawn'/,
      );
    });

    it('allows transition without synchronization', () => {
      const input = createValidInput({
        transitions: [
          {
            ref: 'simple',
            fromNodeRef: 'start',
            toNodeRef: 'end',
            priority: 0,
            // No synchronization
          },
        ],
      });

      expect(() => validateWorkflowDef(input)).not.toThrow();
    });
  });

  describe('ValidationError structure', () => {
    it('includes error code and path', () => {
      const input = createValidInput({
        nodes: [
          { ref: 'dup', name: 'First' },
          { ref: 'dup', name: 'Second' },
        ],
      });

      try {
        validateWorkflowDef(input);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.code).toBe('DUPLICATE_NODE_REF');
        expect(validationError.path).toBe('nodes[dup]');
      }
    });

    it('includes INVALID_SIBLING_GROUP_REF code for bad siblingGroup', () => {
      const input = createValidInput({
        transitions: [
          {
            ref: 'bad',
            fromNodeRef: 'start',
            toNodeRef: 'end',
            priority: 0,
            synchronization: {
              strategy: 'wait_all',
              siblingGroup: 'ghost',
            },
          },
        ],
      });

      try {
        validateWorkflowDef(input);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.code).toBe('INVALID_SIBLING_GROUP_REF');
      }
    });
  });
});
