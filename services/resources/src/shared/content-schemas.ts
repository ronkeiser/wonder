/**
 * Zod schemas for validating the `content` field of each definition kind.
 *
 * These schemas define the structure of entity-specific data stored in the
 * unified `definitions` table's JSON `content` column.
 */

import { z } from 'zod';

// ============================================================================
// Definition Kinds
// ============================================================================

export const DEFINITION_KINDS = [
  'workflow_def',
  'task',
  'action',
  'persona',
  'prompt_spec',
  'artifact_type',
  'model_profile',
] as const;

export type DefinitionKind = (typeof DEFINITION_KINDS)[number];

// ============================================================================
// Scope Rules by Kind
// ============================================================================

export type ScopeRule = 'project_or_library' | 'library_only' | 'global';

export const SCOPE_RULES: Record<DefinitionKind, ScopeRule> = {
  workflow_def: 'project_or_library', // exactly one of projectId XOR libraryId
  task: 'project_or_library',
  persona: 'library_only', // libraryId optional, projectId must be null
  action: 'global', // both must be null
  prompt_spec: 'global',
  artifact_type: 'global',
  model_profile: 'global',
};

// ============================================================================
// Shared Schemas
// ============================================================================

const jsonObjectSchema = z.record(z.string(), z.unknown());

// ============================================================================
// WorkflowDef Content Schema
// ============================================================================

/**
 * Node schema for workflow definitions.
 * Uses z.unknown() for fields that come from database schema types (which use `object`)
 * to avoid type incompatibility between TypeScript's `object` and `Record<string, unknown>`.
 */
const nodeInputSchema = z.object({
  id: z.string(),
  ref: z.string(),
  name: z.string(),
  taskId: z.string().nullable().optional(),
  taskVersion: z.number().nullable().optional(),
  subworkflowId: z.string().nullable().optional(),
  subworkflowVersion: z.number().nullable().optional(),
  inputMapping: z.unknown().nullable().optional(),
  outputMapping: z.unknown().nullable().optional(),
  resourceBindings: z.unknown().nullable().optional(),
});

/**
 * Transition schema for workflow definitions.
 * The condition field accepts Expression ASTs from the parser, so we use z.unknown().
 */
const transitionInputSchema = z.object({
  id: z.string(),
  ref: z.string().nullable().optional(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  priority: z.number(),
  condition: z.unknown().nullable().optional(), // Expression AST
  spawnCount: z.number().nullable().optional(),
  siblingGroup: z.string().nullable().optional(),
  foreach: z.unknown().nullable().optional(), // ForeachConfig
  synchronization: z.unknown().nullable().optional(), // SynchronizationConfig
  loopConfig: z.unknown().nullable().optional(), // LoopConfig
});

export const workflowDefContentSchema = z.object({
  name: z.string(),
  inputSchema: jsonObjectSchema,
  outputSchema: jsonObjectSchema,
  outputMapping: jsonObjectSchema.nullable().optional(),
  contextSchema: jsonObjectSchema.nullable().optional(),
  initialNodeId: z.string().nullable().optional(),
  nodes: z.array(nodeInputSchema),
  transitions: z.array(transitionInputSchema).optional(),
});

export type WorkflowDefContent = z.infer<typeof workflowDefContentSchema>;

// ============================================================================
// Task Content Schema
// ============================================================================

const stepConditionSchema = z.object({
  if: z.string(),
  then: z.enum(['continue', 'skip', 'succeed', 'fail']),
  else: z.enum(['continue', 'skip', 'succeed', 'fail']),
});

const stepSchema = z.object({
  id: z.string(),
  ref: z.string(),
  ordinal: z.number(),
  actionId: z.string(),
  actionVersion: z.number(),
  inputMapping: jsonObjectSchema.nullable(),
  outputMapping: jsonObjectSchema.nullable(),
  onFailure: z.enum(['abort', 'retry', 'continue']),
  condition: stepConditionSchema.nullable(),
});

const retryConfigSchema = z.object({
  maxAttempts: z.number(),
  backoff: z.enum(['none', 'linear', 'exponential']),
  initialDelayMs: z.number(),
  maxDelayMs: z.number().nullable(),
});

export const taskContentSchema = z.object({
  name: z.string(),
  inputSchema: jsonObjectSchema,
  outputSchema: jsonObjectSchema,
  steps: z.array(stepSchema),
  retry: retryConfigSchema.nullable().optional(),
  timeoutMs: z.number().nullable().optional(),
});

export type TaskContent = z.infer<typeof taskContentSchema>;

// ============================================================================
// Action Content Schema
// ============================================================================

export const ACTION_KINDS = [
  'llm',
  'mcp',
  'http',
  'human',
  'context',
  'artifact',
  'vector',
  'metric',
  'mock',
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export const actionContentSchema = z.object({
  name: z.string(),
  kind: z.enum(ACTION_KINDS),
  implementation: jsonObjectSchema,
  requires: jsonObjectSchema.nullable().optional(),
  produces: jsonObjectSchema.nullable().optional(),
  execution: jsonObjectSchema.nullable().optional(),
  idempotency: jsonObjectSchema.nullable().optional(),
});

export type ActionContent = z.infer<typeof actionContentSchema>;

// ============================================================================
// Persona Content Schema
// ============================================================================

const agentConstraintsSchema = z.object({
  maxMovesPerTurn: z.number().optional(),
});

export const personaContentSchema = z.object({
  name: z.string(),
  systemPrompt: z.string(),

  // Reference-based model profile (replaces modelProfileId)
  modelProfileRef: z.string(),
  modelProfileVersion: z.number().nullable(), // null = latest

  // Reference-based workflow definitions (replaces *WorkflowDefId)
  contextAssemblyWorkflowRef: z.string(),
  contextAssemblyWorkflowVersion: z.number().nullable(), // null = latest
  memoryExtractionWorkflowRef: z.string(),
  memoryExtractionWorkflowVersion: z.number().nullable(), // null = latest

  recentTurnsLimit: z.number().default(20),
  toolIds: z.array(z.string()),
  constraints: agentConstraintsSchema.nullable().optional(),
});

export type PersonaContent = z.infer<typeof personaContentSchema>;

// ============================================================================
// PromptSpec Content Schema
// ============================================================================

export const promptSpecContentSchema = z.object({
  name: z.string(),
  systemPrompt: z.string().nullable().optional(),
  template: z.string(),
  requires: jsonObjectSchema.default({}),
  produces: jsonObjectSchema.default({}),
  examples: jsonObjectSchema.nullable().optional(),
});

export type PromptSpecContent = z.infer<typeof promptSpecContentSchema>;

// ============================================================================
// ArtifactType Content Schema
// ============================================================================

export const artifactTypeContentSchema = z.object({
  name: z.string(),
  schema: jsonObjectSchema,
});

export type ArtifactTypeContent = z.infer<typeof artifactTypeContentSchema>;

// ============================================================================
// ModelProfile Content Schema
// ============================================================================

export const modelProfileContentSchema = z.object({
  name: z.string(),
  provider: z.string(),
  modelId: z.string(),
  parameters: jsonObjectSchema.default({}),
  executionConfig: jsonObjectSchema.nullable().optional(),
  costPer1kInputTokens: z.number().default(0),
  costPer1kOutputTokens: z.number().default(0),
});

export type ModelProfileContent = z.infer<typeof modelProfileContentSchema>;

// ============================================================================
// Content Schema Registry
// ============================================================================

export const contentSchemas = {
  workflow_def: workflowDefContentSchema,
  task: taskContentSchema,
  action: actionContentSchema,
  persona: personaContentSchema,
  prompt_spec: promptSpecContentSchema,
  artifact_type: artifactTypeContentSchema,
  model_profile: modelProfileContentSchema,
} as const;

export type ContentSchemaMap = {
  workflow_def: WorkflowDefContent;
  task: TaskContent;
  action: ActionContent;
  persona: PersonaContent;
  prompt_spec: PromptSpecContent;
  artifact_type: ArtifactTypeContent;
  model_profile: ModelProfileContent;
};

/**
 * Validates content against the schema for a given kind.
 * @throws ZodError if validation fails
 */
export function validateContent<K extends DefinitionKind>(
  kind: K,
  content: unknown,
): ContentSchemaMap[K] {
  return contentSchemas[kind].parse(content) as ContentSchemaMap[K];
}

/**
 * Safely validates content, returning null if invalid.
 */
export function safeValidateContent<K extends DefinitionKind>(
  kind: K,
  content: unknown,
): ContentSchemaMap[K] | null {
  const result = contentSchemas[kind].safeParse(content);
  return result.success ? (result.data as ContentSchemaMap[K]) : null;
}
