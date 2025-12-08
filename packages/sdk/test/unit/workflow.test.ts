/**
 * Unit tests for workflow builder
 */

import { describe, expect, it } from 'vitest';
import { node } from '../../src/builders/node';
import { schema } from '../../src/builders/schema';
import { transition } from '../../src/builders/transition';
import { workflowDef } from '../../src/builders/workflow';

describe('workflowDef()', () => {
  it('creates minimal workflow definition', () => {
    const result = workflowDef({
      name: 'Simple Workflow',
      description: 'A simple workflow',
      input_schema: schema.object({ data: schema.string() }),
      output_schema: schema.object({ result: schema.string() }),
      initial_node_ref: 'start',
      nodes: [
        node({
          ref: 'start',
          name: 'Start Node',
          action_id: 'action-1',
        }),
      ],
    });

    expect(result).toEqual({
      name: 'Simple Workflow',
      description: 'A simple workflow',
      input_schema: {
        type: 'object',
        properties: {
          data: { type: 'string' },
        },
        additionalProperties: false,
      },
      output_schema: {
        type: 'object',
        properties: {
          result: { type: 'string' },
        },
        additionalProperties: false,
      },
      initial_node_ref: 'start',
      nodes: [
        {
          ref: 'start',
          name: 'Start Node',
          action_id: 'action-1',
        },
      ],
    });
  });

  // Version is not part of the builder API - it's always set to 1 by the repository layer
  // when creating new workflow definitions

  it('creates workflow with project_id', () => {
    const result = workflowDef({
      name: 'Project Workflow',
      description: 'Workflow in project',
      project_id: 'project-123',
      input_schema: schema.object({}),
      output_schema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
    });

    expect(result.project_id).toBe('project-123');
  });

  it('creates workflow with context_schema', () => {
    const contextSchema = schema.object({
      apiKey: schema.string(),
    });

    const result = workflowDef({
      name: 'Context Workflow',
      description: 'Workflow with context',
      input_schema: schema.object({}),
      output_schema: schema.object({}),
      context_schema: contextSchema,
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
    });

    expect(result.context_schema).toEqual(contextSchema);
  });

  it('creates workflow with transitions', () => {
    const result = workflowDef({
      name: 'Multi-Node Workflow',
      description: 'Workflow with transitions',
      input_schema: schema.object({}),
      output_schema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' }), node({ ref: 'end', name: 'End' })],
      transitions: [
        transition({
          from_node_ref: 'start',
          to_node_ref: 'end',
          priority: 1,
        }),
      ],
    });

    expect(result.transitions).toEqual([
      {
        from_node_ref: 'start',
        to_node_ref: 'end',
        priority: 1,
      },
    ]);
  });

  it('creates workflow with output_mapping', () => {
    const result = workflowDef({
      name: 'Mapped Workflow',
      description: 'Workflow with output mapping',
      input_schema: schema.object({}),
      output_schema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
      output_mapping: {
        finalResult: '$.start.result',
      },
    });

    expect(result.output_mapping).toEqual({
      finalResult: '$.start.result',
    });
  });

  it('creates workflow with tags', () => {
    const result = workflowDef({
      name: 'Tagged Workflow',
      description: 'Workflow with tags',
      tags: ['production', 'automated'],
      input_schema: schema.object({}),
      output_schema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
    });

    expect(result.tags).toEqual(['production', 'automated']);
  });

  it('creates complete workflow with all features', () => {
    const result = workflowDef({
      name: 'Complete Workflow',
      description: 'Full-featured workflow',
      project_id: 'proj-123',
      library_id: 'lib-456',
      tags: ['test'],
      input_schema: schema.object({ input: schema.string() }),
      output_schema: schema.object({ output: schema.string() }),
      context_schema: schema.object({ apiKey: schema.string() }),
      initial_node_ref: 'start',
      nodes: [
        node({ ref: 'start', name: 'Start', action_id: 'action-1' }),
        node({ ref: 'middle', name: 'Middle', action_id: 'action-2' }),
        node({ ref: 'end', name: 'End', action_id: 'action-3' }),
      ],
      transitions: [
        transition({ from_node_ref: 'start', to_node_ref: 'middle', priority: 1 }),
        transition({ from_node_ref: 'middle', to_node_ref: 'end', priority: 1 }),
      ],
      output_mapping: {
        result: '$.end.output',
      },
    });

    expect(result).toMatchObject({
      name: 'Complete Workflow',
      project_id: 'proj-123',
      library_id: 'lib-456',
      tags: ['test'],
      initial_node_ref: 'start',
    });
    expect(result.nodes).toHaveLength(3);
    expect(result.transitions).toHaveLength(2);
  });

  describe('validation', () => {
    it('throws if initial_node_ref does not exist', () => {
      expect(() =>
        workflowDef({
          name: 'Invalid',
          description: 'Bad initial node',
          input_schema: schema.object({}),
          output_schema: schema.object({}),
          initial_node_ref: 'nonexistent',
          nodes: [node({ ref: 'start', name: 'Start' })],
        }),
      ).toThrow(/initial_node_ref 'nonexistent' does not match any node ref/);
    });

    it('throws if transition from_node_ref does not exist', () => {
      expect(() =>
        workflowDef({
          name: 'Invalid',
          description: 'Bad transition',
          input_schema: schema.object({}),
          output_schema: schema.object({}),
          initial_node_ref: 'start',
          nodes: [node({ ref: 'start', name: 'Start' }), node({ ref: 'end', name: 'End' })],
          transitions: [
            transition({
              from_node_ref: 'nonexistent',
              to_node_ref: 'end',
              priority: 1,
            }),
          ],
        }),
      ).toThrow(/from_node_ref 'nonexistent' does not match any node ref/);
    });

    it('throws if transition to_node_ref does not exist', () => {
      expect(() =>
        workflowDef({
          name: 'Invalid',
          description: 'Bad transition',
          input_schema: schema.object({}),
          output_schema: schema.object({}),
          initial_node_ref: 'start',
          nodes: [node({ ref: 'start', name: 'Start' }), node({ ref: 'end', name: 'End' })],
          transitions: [
            transition({
              from_node_ref: 'start',
              to_node_ref: 'nonexistent',
              priority: 1,
            }),
          ],
        }),
      ).toThrow(/to_node_ref 'nonexistent' does not match any node ref/);
    });
  });
});
