// =============================================================================
// WONDER D1 SCHEMA
// Derived from docs/architecture/primitives.ts
// =============================================================================

import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// =============================================================================
// WORKSPACE & PROJECT
// =============================================================================

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  settings: text('settings', { mode: 'json' }), // WorkspaceSettings as JSONB
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
  description: text('description'),
  settings: text('settings', { mode: 'json' }), // ProjectSettings as JSONB
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// =============================================================================
// LIBRARY
// =============================================================================

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').references(() => workspaces.id), // null = public/global
  name: text('name').notNull(),
  description: text('description'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// =============================================================================
// WORKFLOW DEFINITIONS
// =============================================================================

export const workflow_defs = sqliteTable('workflow_defs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  version: integer('version').notNull(),

  // WorkflowDefOwner discriminated union
  owner_type: text('owner_type', { enum: ['project', 'library'] }).notNull(),
  owner_id: text('owner_id').notNull(), // project_id or library_id

  tags: text('tags', { mode: 'json' }), // string[]
  input_schema: text('input_schema', { mode: 'json' }).notNull(),
  output_schema: text('output_schema', { mode: 'json' }).notNull(),
  context_schema: text('context_schema', { mode: 'json' }),

  initial_node_id: text('initial_node_id').notNull(),

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  project_id: text('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  description: text('description').notNull(),
  workflow_def_id: text('workflow_def_id')
    .notNull()
    .references(() => workflow_defs.id),
  pinned_version: integer('pinned_version'), // null = always use latest
  triggers: text('triggers', { mode: 'json' }), // TriggerDef[]
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// =============================================================================
// GRAPH STRUCTURE
// =============================================================================

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  workflow_def_id: text('workflow_def_id')
    .notNull()
    .references(() => workflow_defs.id),
  name: text('name').notNull(),
  action_id: text('action_id')
    .notNull()
    .references(() => actions.id),

  input_mapping: text('input_mapping', { mode: 'json' }),
  output_mapping: text('output_mapping', { mode: 'json' }),

  fan_out: text('fan_out', { enum: ['first_match', 'all'] }).notNull(),
  fan_in: text('fan_in', { mode: 'json' }).notNull(), // 'any' | 'all' | { m_of_n: number }

  joins_node: text('joins_node'), // references nodes.id (same workflow_def_id)
  merge: text('merge', { mode: 'json' }), // merge strategy config
  on_early_complete: text('on_early_complete', {
    enum: ['cancel', 'abandon', 'allow_late_merge'],
  }),
});

export const transitions = sqliteTable('transitions', {
  id: text('id').primaryKey(),
  workflow_def_id: text('workflow_def_id')
    .notNull()
    .references(() => workflow_defs.id),
  from_node_id: text('from_node_id')
    .notNull()
    .references(() => nodes.id),
  to_node_id: text('to_node_id')
    .notNull()
    .references(() => nodes.id),
  priority: integer('priority').notNull(),

  condition: text('condition', { mode: 'json' }), // structured or expression
  foreach: text('foreach', { mode: 'json' }), // foreach config
  loop_config: text('loop_config', { mode: 'json' }),
});

// =============================================================================
// ACTIONS
// =============================================================================

export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  version: integer('version').notNull(),

  kind: text('kind', {
    enum: [
      'llm_call',
      'mcp_tool',
      'http_request',
      'human_input',
      'update_context',
      'write_artifact',
      'workflow_call',
      'vector_search',
      'emit_metric',
    ],
  }).notNull(),

  implementation: text('implementation', { mode: 'json' }).notNull(), // discriminated by kind

  requires: text('requires', { mode: 'json' }),
  produces: text('produces', { mode: 'json' }),
  execution: text('execution', { mode: 'json' }), // timeout, retry_policy
  idempotency: text('idempotency', { mode: 'json' }),

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

// =============================================================================
// AI PRIMITIVES
// =============================================================================

export const prompt_specs = sqliteTable('prompt_specs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  version: integer('version').notNull(),

  system_prompt: text('system_prompt'),
  template: text('template').notNull(),
  template_language: text('template_language', {
    enum: ['handlebars', 'jinja2'],
  }).notNull(),

  requires: text('requires', { mode: 'json' }).notNull(),
  produces: text('produces', { mode: 'json' }).notNull(),
  examples: text('examples', { mode: 'json' }),
  tags: text('tags', { mode: 'json' }),

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const model_profiles = sqliteTable('model_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider', {
    enum: ['anthropic', 'openai', 'google', 'cloudflare', 'local'],
  }).notNull(),
  model_id: text('model_id').notNull(),

  parameters: text('parameters', { mode: 'json' }).notNull(),
  execution_config: text('execution_config', { mode: 'json' }),

  cost_per_1k_input_tokens: integer('cost_per_1k_input_tokens').notNull(),
  cost_per_1k_output_tokens: integer('cost_per_1k_output_tokens').notNull(),
});

// =============================================================================
// WORKFLOW RUNS & EXECUTION
// =============================================================================

export const workflow_runs = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  project_id: text('project_id')
    .notNull()
    .references(() => projects.id),
  workflow_id: text('workflow_id')
    .notNull()
    .references(() => workflows.id),
  workflow_def_id: text('workflow_def_id')
    .notNull()
    .references(() => workflow_defs.id),
  workflow_version: integer('workflow_version').notNull(),

  status: text('status', {
    enum: ['running', 'completed', 'failed', 'waiting'],
  }).notNull(),

  context: text('context', { mode: 'json' }).notNull(), // Context (input, state, output, artifacts, _branch)
  active_tokens: text('active_tokens', { mode: 'json' }).notNull(), // Token[]

  durable_object_id: text('durable_object_id').notNull(),
  latest_snapshot: text('latest_snapshot', { mode: 'json' }), // Snapshot

  parent_run_id: text('parent_run_id'),
  parent_node_id: text('parent_node_id'),

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  completed_at: text('completed_at'),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  workflow_run_id: text('workflow_run_id')
    .notNull()
    .references(() => workflow_runs.id),
  sequence_number: integer('sequence_number').notNull(),

  kind: text('kind', {
    enum: [
      'workflow_started',
      'workflow_completed',
      'workflow_failed',
      'workflow_waiting',
      'workflow_resumed',
      'node_started',
      'node_completed',
      'node_failed',
      'transition_taken',
      'token_spawned',
      'token_merged',
      'token_cancelled',
      'artifact_created',
      'context_updated',
      'subworkflow_started',
      'subworkflow_completed',
    ],
  }).notNull(),

  payload: text('payload', { mode: 'json' }).notNull(),
  timestamp: text('timestamp').notNull(),
});

// =============================================================================
// ARTIFACTS
// =============================================================================

export const artifact_types = sqliteTable('artifact_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  schema: text('schema', { mode: 'json' }).notNull(),
  version: integer('version').notNull(),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  project_id: text('project_id')
    .notNull()
    .references(() => projects.id),
  type_id: text('type_id')
    .notNull()
    .references(() => artifact_types.id),
  type_version: integer('type_version').notNull(),

  content: text('content', { mode: 'json' }).notNull(),

  created_by_workflow_run_id: text('created_by_workflow_run_id').references(() => workflow_runs.id),
  created_by_node_id: text('created_by_node_id'),

  created_at: text('created_at').notNull(),
});

// =============================================================================
// VECTOR SEARCH
// =============================================================================

export const vector_indexes = sqliteTable('vector_indexes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  vectorize_index_id: text('vectorize_index_id').notNull(),

  artifact_type_ids: text('artifact_type_ids', { mode: 'json' }).notNull(),
  embedding_provider: text('embedding_provider', {
    enum: ['openai', 'cloudflare_ai'],
  }).notNull(),
  embedding_model: text('embedding_model').notNull(),
  dimensions: integer('dimensions').notNull(),

  content_fields: text('content_fields', { mode: 'json' }).notNull(),
  auto_index: integer('auto_index', { mode: 'boolean' }).notNull(),

  created_at: text('created_at').notNull(),
});

// =============================================================================
// TRIGGERS
// =============================================================================

export const triggers = sqliteTable('triggers', {
  id: text('id').primaryKey(),
  workflow_id: text('workflow_id')
    .notNull()
    .references(() => workflows.id),

  kind: text('kind', { enum: ['webhook', 'schedule', 'event'] }).notNull(),
  config: text('config', { mode: 'json' }).notNull(), // discriminated by kind

  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  created_at: text('created_at').notNull(),
});

// =============================================================================
// AUTH & PERMISSIONS
// =============================================================================

export const actors = sqliteTable('actors', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['human', 'system'] }).notNull(),
  name: text('name').notNull(),
  email: text('email'),
  permissions: text('permissions', { mode: 'json' }).notNull(), // Permission[]
  created_at: text('created_at').notNull(),
});

// =============================================================================
// SECRETS
// =============================================================================

export const secrets = sqliteTable('secrets', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  key: text('key').notNull(), // e.g., 'ANTHROPIC_API_KEY', 'MCP_GITHUB_TOKEN'
  encrypted_value: blob('encrypted_value').notNull(), // Encrypted at rest
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
