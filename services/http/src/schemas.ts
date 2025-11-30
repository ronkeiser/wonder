/**
 * HTTP request validation schemas
 * Derived from API base schemas but customized for HTTP layer needs
 */

import { z } from '@hono/zod-openapi';

// ULID regex pattern: 26 characters, uppercase letters and digits (excludes I, L, O, U)
const ulidRegex = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const ulid = () => z.string().regex(ulidRegex, 'Invalid ULID format');

/** Export ULID validator for use in routes */
export { ulid };

/** Workspace Schemas */
export const CreateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'My Workspace' }),
    settings: z.record(z.string(), z.unknown()).optional().openapi({ example: {} }),
  })
  .openapi('CreateWorkspace');

export const WorkspaceSchema = z
  .object({
    id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().openapi({ example: 'My Workspace' }),
    settings: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string().openapi({ example: '2024-01-01T00:00:00Z' }),
    updated_at: z.string().openapi({ example: '2024-01-01T00:00:00Z' }),
  })
  .openapi('Workspace');

export const WorkspaceCreateResponseSchema = z
  .object({
    workspace_id: ulid(),
    workspace: WorkspaceSchema,
  })
  .openapi('WorkspaceCreateResponse');

export const WorkspaceGetResponseSchema = z
  .object({
    workspace: WorkspaceSchema,
  })
  .openapi('WorkspaceGetResponse');

export const WorkspaceListResponseSchema = z
  .object({
    workspaces: z.array(WorkspaceSchema),
  })
  .openapi('WorkspaceListResponse');

export const UpdateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(255).optional().openapi({ example: 'My Workspace' }),
    settings: z.record(z.string(), z.unknown()).optional().openapi({ example: {} }),
  })
  .openapi('UpdateWorkspace');

export const WorkspaceUpdateResponseSchema = z
  .object({
    workspace: WorkspaceSchema,
  })
  .openapi('WorkspaceUpdateResponse');

/** Project Schemas */
export const CreateProjectSchema = z
  .object({
    workspace_id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().min(1).max(255).openapi({ example: 'My Project' }),
    description: z.string().optional().openapi({ example: 'Project description' }),
    settings: z.record(z.string(), z.unknown()).optional().openapi({ example: {} }),
  })
  .openapi('CreateProject');

export const ProjectSchema = z
  .object({
    id: ulid(),
    workspace_id: ulid(),
    name: z.string(),
    description: z.string().nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Project');

export const ProjectCreateResponseSchema = z
  .object({
    project_id: ulid(),
    project: ProjectSchema,
  })
  .openapi('ProjectCreateResponse');

export const ProjectGetResponseSchema = z
  .object({
    project: ProjectSchema,
  })
  .openapi('ProjectGetResponse');

/** Action Schemas */
export const CreateActionSchema = z
  .object({
    id: z.string().min(1).openapi({ example: 'send-email' }),
    name: z.string().min(1).max(255).openapi({ example: 'Generate Summary' }),
    description: z.string().min(1).openapi({ example: 'Generates a summary using LLM' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    kind: z
      .enum([
        'llm_call',
        'mcp_tool',
        'http_request',
        'human_input',
        'update_context',
        'write_artifact',
        'workflow_call',
        'vector_search',
        'emit_metric',
      ])
      .openapi({ example: 'llm_call' }),
    implementation: z.record(z.string(), z.unknown()).openapi({ example: { model: 'gpt-4' } }),
    requires: z.record(z.string(), z.unknown()).optional(),
    produces: z.record(z.string(), z.unknown()).optional(),
    execution: z.record(z.string(), z.unknown()).optional(),
    idempotency: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('CreateAction');

export const ActionSchema = z
  .object({
    id: z.string().openapi({ example: 'send-email' }),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    kind: z.enum([
      'llm_call',
      'mcp_tool',
      'http_request',
      'human_input',
      'update_context',
      'write_artifact',
      'workflow_call',
      'vector_search',
      'emit_metric',
    ]),
    implementation: z.record(z.string(), z.unknown()),
    requires: z.record(z.string(), z.unknown()).nullable(),
    produces: z.record(z.string(), z.unknown()).nullable(),
    execution: z.record(z.string(), z.unknown()).nullable(),
    idempotency: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Action');

export const ActionCreateResponseSchema = z
  .object({
    action_id: z.string(),
    action: ActionSchema,
  })
  .openapi('ActionCreateResponse');

export const ActionGetResponseSchema = z
  .object({
    action: ActionSchema,
  })
  .openapi('ActionGetResponse');

/** Prompt Spec Schemas */
export const CreatePromptSpecSchema = z
  .object({
    id: z.string().min(1).openapi({ example: 'summarize-text' }),
    name: z.string().min(1).max(255).openapi({ example: 'Summarization Prompt' }),
    description: z.string().min(1).openapi({ example: 'Prompt for summarizing text' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    system_prompt: z.string().optional().openapi({ example: 'You are a helpful assistant.' }),
    template: z.string().min(1).openapi({ example: 'Summarize: {{text}}' }),
    template_language: z.enum(['handlebars', 'jinja2']).openapi({ example: 'handlebars' }),
    requires: z.record(z.string(), z.unknown()).openapi({ example: { text: 'string' } }),
    produces: z.record(z.string(), z.unknown()).openapi({ example: { summary: 'string' } }),
    examples: z.array(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .openapi('CreatePromptSpec');

export const PromptSpecSchema = z
  .object({
    id: z.string().openapi({ example: 'summarize-text' }),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    system_prompt: z.string().nullable(),
    template: z.string(),
    template_language: z.enum(['handlebars', 'jinja2']),
    requires: z.record(z.string(), z.unknown()),
    produces: z.record(z.string(), z.unknown()),
    examples: z.record(z.string(), z.unknown()).nullable(),
    tags: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('PromptSpec');

export const PromptSpecCreateResponseSchema = z
  .object({
    prompt_spec_id: z.string(),
    prompt_spec: PromptSpecSchema,
  })
  .openapi('PromptSpecCreateResponse');

export const PromptSpecGetResponseSchema = z
  .object({
    prompt_spec: PromptSpecSchema,
  })
  .openapi('PromptSpecGetResponse');

/** Model Profile Schemas */
export const CreateModelProfileSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'GPT-4 Default' }),
    provider: z
      .enum(['anthropic', 'openai', 'google', 'cloudflare', 'local'])
      .openapi({ example: 'openai' }),
    model_id: z.string().min(1).openapi({ example: 'gpt-4' }),
    parameters: z.record(z.string(), z.unknown()).openapi({ example: { temperature: 0.7 } }),
    execution_config: z.record(z.string(), z.unknown()).optional(),
    cost_per_1k_input_tokens: z.number().nonnegative().openapi({ example: 0.03 }),
    cost_per_1k_output_tokens: z.number().nonnegative().openapi({ example: 0.06 }),
  })
  .openapi('CreateModelProfile');

export const ModelProfileSchema = z
  .object({
    id: ulid(),
    name: z.string(),
    provider: z.enum(['anthropic', 'openai', 'google', 'cloudflare', 'local']),
    model_id: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    execution_config: z.record(z.string(), z.unknown()).nullable(),
    cost_per_1k_input_tokens: z.number(),
    cost_per_1k_output_tokens: z.number(),
  })
  .openapi('ModelProfile');

export const ModelProfileCreateResponseSchema = z
  .object({
    model_profile_id: ulid(),
    model_profile: ModelProfileSchema,
  })
  .openapi('ModelProfileCreateResponse');

export const ModelProfileGetResponseSchema = z
  .object({
    model_profile: ModelProfileSchema,
  })
  .openapi('ModelProfileGetResponse');

/** Workflow Definition Schemas */
export const CreateWorkflowDefSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: 'Content Generation Pipeline' }),
    description: z.string().min(1).openapi({ example: 'Generates and reviews content' }),
    version: z.number().int().positive().default(1).openapi({ example: 1 }),
    owner: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('project'), project_id: ulid() }),
        z.object({ type: z.literal('library'), library_id: ulid() }),
      ])
      .openapi({
        example: { type: 'project', project_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
      }),
    tags: z.array(z.string()).optional(),
    input_schema: z.record(z.string(), z.unknown()).openapi({ example: { topic: 'string' } }),
    output_schema: z.record(z.string(), z.unknown()).openapi({ example: { content: 'string' } }),
    context_schema: z.record(z.string(), z.unknown()).optional(),
    initial_node_id: z.string().min(1).openapi({ example: 'node-1' }),
    nodes: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        action_id: z.string().min(1).openapi({ example: 'send-email' }),
        action_version: z.number().int().positive().openapi({ example: 1 }),
        input_mapping: z.record(z.string(), z.unknown()).optional(),
        output_mapping: z.record(z.string(), z.unknown()).optional(),
        fan_out: z.enum(['first_match', 'all']).optional(),
        fan_in: z.union([z.enum(['any', 'all']), z.object({ m_of_n: z.number() })]).optional(),
        joins_node: z.string().optional(),
        merge: z.unknown().optional(),
        on_early_complete: z.enum(['cancel', 'abandon', 'allow_late_merge']).optional(),
      }),
    ),
    transitions: z
      .array(
        z.object({
          from_node_id: z.string().min(1),
          to_node_id: z.string().min(1),
          priority: z.number().int(),
          condition: z.unknown().optional(),
          foreach: z.unknown().optional(),
          loop_config: z.unknown().optional(),
        }),
      )
      .optional(),
  })
  .openapi('CreateWorkflowDef');

export const WorkflowDefSchema = z
  .object({
    id: ulid(),
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
    owner_type: z.enum(['project', 'library']),
    owner_id: ulid(),
    tags: z.record(z.string(), z.unknown()).nullable(),
    input_schema: z.record(z.string(), z.unknown()),
    output_schema: z.record(z.string(), z.unknown()),
    context_schema: z.record(z.string(), z.unknown()).nullable(),
    initial_node_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('WorkflowDef');

export const WorkflowDefCreateResponseSchema = z
  .object({
    workflow_def_id: ulid(),
    workflow_def: WorkflowDefSchema,
  })
  .openapi('WorkflowDefCreateResponse');

export const WorkflowDefGetResponseSchema = z
  .object({
    workflow_def: WorkflowDefSchema,
    nodes: z.array(z.unknown()),
    transitions: z.array(z.unknown()),
  })
  .openapi('WorkflowDefGetResponse');

export const WorkflowDefListResponseSchema = z
  .object({
    workflow_defs: z.array(WorkflowDefSchema),
  })
  .openapi('WorkflowDefListResponse');

/** Workflow (Binding) Schemas */
export const CreateWorkflowSchema = z
  .object({
    project_id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    workflow_def_id: ulid().openapi({ example: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
    name: z.string().min(1).max(255).openapi({ example: 'My Workflow Instance' }),
    description: z.string().optional().openapi({ example: 'Production workflow instance' }),
  })
  .openapi('CreateWorkflow');

export const WorkflowSchema = z
  .object({
    id: ulid(),
    project_id: ulid(),
    workflow_def_id: ulid(),
    name: z.string(),
    description: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Workflow');

export const WorkflowCreateResponseSchema = z
  .object({
    workflow_id: ulid(),
    workflow: WorkflowSchema,
  })
  .openapi('WorkflowCreateResponse');

export const WorkflowGetResponseSchema = z
  .object({
    workflow: WorkflowSchema,
  })
  .openapi('WorkflowGetResponse');
