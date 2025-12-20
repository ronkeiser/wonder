/**
 * Workflow Definition Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

export const CreateWorkflowDefSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Content Generation Pipeline' }),
    description: z.string().min(1).openapi({ example: 'Generates and reviews content' }),
    projectId: ulid().optional().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    libraryId: ulid().optional(),
    tags: z.array(z.string()).optional(),
    inputSchema: z.record(z.string(), z.unknown()).openapi({ example: { topic: 'string' } }),
    outputSchema: z.record(z.string(), z.unknown()).openapi({ example: { content: 'string' } }),
    outputMapping: z
      .record(z.string(), z.string())
      .optional()
      .openapi({ example: { result: '$.final_node_output.response' } }),
    contextSchema: z.record(z.string(), z.unknown()).optional(),
    initialNodeRef: z
      .string()
      .min(1)
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      .openapi({ example: 'startNode' }),
    nodes: z.array(
      z.object({
        ref: z
          .string()
          .min(1)
          .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
          .openapi({ example: 'llmCallNode' }),
        name: z.string().min(1),
        taskId: z.string().min(1).optional().openapi({ example: 'my-task' }),
        taskVersion: z.number().int().positive().optional().openapi({ example: 1 }),
        inputMapping: z.record(z.string(), z.unknown()).optional(),
        outputMapping: z.record(z.string(), z.unknown()).optional(),
        resourceBindings: z
          .record(z.string(), z.string())
          .optional()
          .openapi({ example: { container: 'dev_env' } }),
      }),
    ),
    transitions: z
      .array(
        z.object({
          ref: z
            .string()
            .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
            .optional(),
          fromNodeRef: z.string().min(1),
          toNodeRef: z.string().min(1),
          priority: z.number().int(),
          condition: z.record(z.string(), z.unknown()).optional(),
          spawnCount: z.number().int().optional(),
          siblingGroup: z.string().optional(),
          foreach: z.record(z.string(), z.unknown()).optional(),
          synchronization: z
            .object({
              strategy: z.string(),
              siblingGroup: z.string(),
              merge: z.record(z.string(), z.unknown()).optional(),
            })
            .optional(),
          loopConfig: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
    autoversion: z.boolean().optional().openapi({
      description: 'Enable content-based deduplication. If true, returns existing workflow def when content matches.',
    }),
  })
  .openapi('CreateWorkflowDef');

export const NodeSchema = z
  .object({
    id: ulid(),
    workflowDefId: ulid(),
    workflowDefVersion: z.number().int(),
    ref: z.string(),
    name: z.string(),
    taskId: z.string().nullable(),
    taskVersion: z.number().int().nullable(),
    inputMapping: z.record(z.string(), z.unknown()).nullable(),
    outputMapping: z.record(z.string(), z.unknown()).nullable(),
    resourceBindings: z.record(z.string(), z.string()).nullable(),
  })
  .openapi('Node');

export const TransitionSchema = z
  .object({
    id: ulid(),
    workflowDefId: ulid(),
    workflowDefVersion: z.number().int(),
    ref: z.string().nullable(),
    fromNodeId: z.string(),
    toNodeId: z.string(),
    priority: z.number().int(),
    condition: z.record(z.string(), z.unknown()).nullable(),
    spawnCount: z.number().int().nullable(),
    foreach: z.record(z.string(), z.unknown()).nullable(),
    synchronization: z.record(z.string(), z.unknown()).nullable(),
    loopConfig: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('Transition');

export const WorkflowDefSchema = z
  .object({
    id: ulid(),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    projectId: ulid().nullable(),
    libraryId: ulid().nullable(),
    tags: z.array(z.string()).nullable(),
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: z.record(z.string(), z.unknown()),
    contextSchema: z.record(z.string(), z.unknown()).nullable(),
    initialNodeId: z.string().nullable(),
    contentHash: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowDef');

export const WorkflowDefCreateResponseSchema = z
  .object({
    workflowDefId: ulid(),
    workflowDef: WorkflowDefSchema,
    /** True if an existing workflow def was reused (autoversion matched content hash) */
    reused: z.boolean(),
  })
  .openapi('WorkflowDefCreateResponse');

export const WorkflowDefGetResponseSchema = z
  .object({
    workflowDef: WorkflowDefSchema,
    nodes: z.array(NodeSchema),
    transitions: z.array(TransitionSchema),
  })
  .openapi('WorkflowDefGetResponse');
