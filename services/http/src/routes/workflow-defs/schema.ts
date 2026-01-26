/**
 * Workflow Definition Zod Schemas
 */

import { z } from '@hono/zod-openapi';
import { ulid } from '../../validators';

// ============================================================================
// Shared Config Schemas (match schema/types.ts definitions)
// ============================================================================

const ForeachConfigSchema = z.object({
  collection: z.string(), // Path to array in context (e.g., 'input.judges')
  itemVar: z.string(), // Variable name for each item
});

const LoopConfigSchema = z.object({
  maxIterations: z.number().int().positive(), // Maximum times this transition can fire per token lineage
});

const MergeConfigSchema = z.object({
  source: z.string(), // Path in branch output (e.g., '_branch.output', '_branch.output.choice')
  target: z.string(), // Where to write merged result (e.g., 'state.votes')
  strategy: z.enum(['append', 'collect', 'merge_object', 'keyed_by_branch', 'last_wins']),
});

// ============================================================================
// Create Workflow Def Schema
// ============================================================================

export const CreateWorkflowDefSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Content Generation Pipeline' }),
    reference: z.string().optional().openapi({
      example: 'core/content-pipeline',
      description: 'Stable identity for autoversion scoping. Required when autoversion=true.',
    }),
    description: z.string().min(1).openapi({ example: 'Generates and reviews content' }),
    projectId: ulid().optional().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    libraryId: ulid().optional(),
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
        subworkflowId: z.string().min(1).optional().openapi({ example: 'child-workflow-id' }),
        subworkflowVersion: z.number().int().positive().optional().openapi({ example: 1 }),
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
          condition: z.string().optional(), // Expression string (e.g., "state.score >= 80")
          spawnCount: z.number().int().optional(),
          siblingGroup: z.string().optional(),
          foreach: ForeachConfigSchema.optional(),
          synchronization: z
            .object({
              strategy: z.string(), // "any", "all", or "m_of_n:N" - parsed later
              siblingGroup: z.string(),
              merge: MergeConfigSchema.optional(),
              timeoutMs: z.number().int().positive().optional(),
              onTimeout: z.enum(['fail', 'proceed_with_available']).optional(),
            })
            .optional(),
          loopConfig: LoopConfigSchema.optional(),
        }),
      )
      .optional(),
    autoversion: z.boolean().optional().openapi({
      description: 'Enable content-based deduplication. If true, returns existing workflow def when content matches.',
    }),
    force: z.boolean().optional().openapi({
      description: 'Skip content hash deduplication and always create a new version.',
    }),
  })
  .openapi('CreateWorkflowDef');

export const NodeSchema = z
  .object({
    id: ulid(),
    definitionId: ulid(),
    definitionVersion: z.number().int(),
    ref: z.string(),
    name: z.string(),
    taskId: z.string().nullable(),
    taskVersion: z.number().int().nullable(),
    subworkflowId: z.string().nullable(),
    subworkflowVersion: z.number().int().nullable(),
    inputMapping: z.record(z.string(), z.unknown()).nullable(),
    outputMapping: z.record(z.string(), z.unknown()).nullable(),
    resourceBindings: z.record(z.string(), z.string()).nullable(),
  })
  .openapi('Node');

export const TransitionSchema = z
  .object({
    id: ulid(),
    definitionId: ulid(),
    definitionVersion: z.number().int(),
    ref: z.string().nullable(),
    fromNodeId: z.string(),
    toNodeId: z.string(),
    priority: z.number().int(),
    condition: z.record(z.string(), z.unknown()).nullable(), // Parsed AST from expression string
    spawnCount: z.number().int().nullable(),
    siblingGroup: z.string().nullable(),
    foreach: z.record(z.string(), z.unknown()).nullable(),
    synchronization: z.record(z.string(), z.unknown()).nullable(),
    loopConfig: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('Transition');

export const WorkflowDefSchema = z
  .object({
    id: ulid(),
    name: z.string(),
    reference: z.string().openapi({ description: 'Stable identity for autoversion scoping' }),
    description: z.string(),
    version: z.number().int(),
    projectId: ulid().nullable(),
    libraryId: ulid().nullable(),
    contentHash: z.string(),
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: z.record(z.string(), z.unknown()),
    outputMapping: z.record(z.string(), z.unknown()).nullable(),
    contextSchema: z.record(z.string(), z.unknown()).nullable(),
    initialNodeId: z.string().nullable(),
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
    version: z.number().openapi({ description: 'Version number of the created/reused workflow def' }),
    latestVersion: z.number().optional().openapi({
      description: 'Latest version for this name (only present when reused=true)',
    }),
  })
  .openapi('WorkflowDefCreateResponse');

export const WorkflowDefGetResponseSchema = z
  .object({
    workflowDef: WorkflowDefSchema,
    nodes: z.array(NodeSchema),
    transitions: z.array(TransitionSchema),
  })
  .openapi('WorkflowDefGetResponse');

export const WorkflowDefListResponseSchema = z
  .object({
    workflowDefs: z.array(WorkflowDefSchema),
  })
  .openapi('WorkflowDefListResponse');
