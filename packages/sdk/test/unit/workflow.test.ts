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
      inputSchema: schema.object({ data: schema.string() }),
      outputSchema: schema.object({ result: schema.string() }),
      initial_node_ref: 'start',
      nodes: [
        node({
          ref: 'start',
          name: 'Start Node',
          taskId: 'task-1',
        }),
      ],
    });

    expect(result).toEqual({
      name: 'Simple Workflow',
      description: 'A simple workflow',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string' },
        },
        additionalProperties: false,
      },
      outputSchema: {
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
          taskId: 'task-1',
        },
      ],
    });
  });

  // Version is not part of the builder API - it's always set to 1 by the repository layer
  // when creating new workflow definitions

  it('creates workflow with projectId', () => {
    const result = workflowDef({
      name: 'Project Workflow',
      description: 'Workflow in project',
      projectId: 'project-123',
      inputSchema: schema.object({}),
      outputSchema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
    });

    expect(result.projectId).toBe('project-123');
  });

  it('creates workflow with contextSchema', () => {
    const contextSchema = schema.object({
      apiKey: schema.string(),
    });

    const result = workflowDef({
      name: 'Context Workflow',
      description: 'Workflow with context',
      inputSchema: schema.object({}),
      outputSchema: schema.object({}),
      contextSchema: contextSchema,
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
    });

    expect(result.contextSchema).toEqual(contextSchema);
  });

  it('creates workflow with transitions', () => {
    const result = workflowDef({
      name: 'Multi-Node Workflow',
      description: 'Workflow with transitions',
      inputSchema: schema.object({}),
      outputSchema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' }), node({ ref: 'end', name: 'End' })],
      transitions: [
        transition({
          fromNodeRef: 'start',
          toNodeRef: 'end',
          priority: 1,
        }),
      ],
    });

    expect(result.transitions).toEqual([
      {
        fromNodeRef: 'start',
        toNodeRef: 'end',
        priority: 1,
      },
    ]);
  });

  it('creates workflow with outputMapping', () => {
    const result = workflowDef({
      name: 'Mapped Workflow',
      description: 'Workflow with output mapping',
      inputSchema: schema.object({}),
      outputSchema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
      outputMapping: {
        finalResult: '$.start.result',
      },
    });

    expect(result.outputMapping).toEqual({
      finalResult: '$.start.result',
    });
  });

  it('creates workflow with tags', () => {
    const result = workflowDef({
      name: 'Tagged Workflow',
      description: 'Workflow with tags',
      tags: ['production', 'automated'],
      inputSchema: schema.object({}),
      outputSchema: schema.object({}),
      initial_node_ref: 'start',
      nodes: [node({ ref: 'start', name: 'Start' })],
    });

    expect(result.tags).toEqual(['production', 'automated']);
  });

  it('creates complete workflow with all features', () => {
    const result = workflowDef({
      name: 'Complete Workflow',
      description: 'Full-featured workflow',
      projectId: 'proj-123',
      libraryId: 'lib-456',
      tags: ['test'],
      inputSchema: schema.object({ input: schema.string() }),
      outputSchema: schema.object({ output: schema.string() }),
      contextSchema: schema.object({ apiKey: schema.string() }),
      initial_node_ref: 'start',
      nodes: [
        node({ ref: 'start', name: 'Start', taskId: 'task-1' }),
        node({ ref: 'middle', name: 'Middle', taskId: 'task-2' }),
        node({ ref: 'end', name: 'End', taskId: 'task-3' }),
      ],
      transitions: [
        transition({ fromNodeRef: 'start', toNodeRef: 'middle', priority: 1 }),
        transition({ fromNodeRef: 'middle', toNodeRef: 'end', priority: 1 }),
      ],
      outputMapping: {
        result: '$.end.output',
      },
    });

    expect(result).toMatchObject({
      name: 'Complete Workflow',
      projectId: 'proj-123',
      libraryId: 'lib-456',
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
          inputSchema: schema.object({}),
          outputSchema: schema.object({}),
          initial_node_ref: 'nonexistent',
          nodes: [node({ ref: 'start', name: 'Start' })],
        }),
      ).toThrow(/initial_node_ref 'nonexistent' does not match any node ref/);
    });

    it('throws if transition fromNodeRef does not exist', () => {
      expect(() =>
        workflowDef({
          name: 'Invalid',
          description: 'Bad transition',
          inputSchema: schema.object({}),
          outputSchema: schema.object({}),
          initial_node_ref: 'start',
          nodes: [node({ ref: 'start', name: 'Start' }), node({ ref: 'end', name: 'End' })],
          transitions: [
            transition({
              fromNodeRef: 'nonexistent',
              toNodeRef: 'end',
              priority: 1,
            }),
          ],
        }),
      ).toThrow(/fromNodeRef 'nonexistent' does not match any node ref/);
    });

    it('throws if transition toNodeRef does not exist', () => {
      expect(() =>
        workflowDef({
          name: 'Invalid',
          description: 'Bad transition',
          inputSchema: schema.object({}),
          outputSchema: schema.object({}),
          initial_node_ref: 'start',
          nodes: [node({ ref: 'start', name: 'Start' }), node({ ref: 'end', name: 'End' })],
          transitions: [
            transition({
              fromNodeRef: 'start',
              toNodeRef: 'nonexistent',
              priority: 1,
            }),
          ],
        }),
      ).toThrow(/toNodeRef 'nonexistent' does not match any node ref/);
    });
  });
});
