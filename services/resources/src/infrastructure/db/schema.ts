/** WONDER D1 SCHEMA */
/** Derived from docs/architecture/primitives.ts */

import {
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import type { ModelId, ModelProfile } from '../../resources/model-profiles/types.js';

/** Type definitions for JSON columns */

/** Workspace & Project */

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const workspace_settings = sqliteTable('workspace_settings', {
  workspace_id: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  allowed_model_providers: text('allowed_model_providers', { mode: 'json' }).$type<string[]>(),
  allowed_mcp_servers: text('allowed_mcp_servers', { mode: 'json' }).$type<string[]>(),
  budget_max_monthly_spend_cents: integer('budget_max_monthly_spend_cents'),
  budget_alert_threshold_cents: integer('budget_alert_threshold_cents'),
});

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [index('idx_projects_workspace').on(table.workspace_id)],
);

export const project_settings = sqliteTable('project_settings', {
  project_id: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  default_model_profile_id: text('default_model_profile_id'),
  rate_limit_max_concurrent_runs: integer('rate_limit_max_concurrent_runs'),
  rate_limit_max_llm_calls_per_hour: integer('rate_limit_max_llm_calls_per_hour'),
  budget_max_monthly_spend_cents: integer('budget_max_monthly_spend_cents'),
  budget_alert_threshold_cents: integer('budget_alert_threshold_cents'),
  snapshot_policy_every_n_events: integer('snapshot_policy_every_n_events'),
  snapshot_policy_every_n_seconds: integer('snapshot_policy_every_n_seconds'),
  snapshot_policy_on_fan_in_complete: integer('snapshot_policy_on_fan_in_complete', {
    mode: 'boolean',
  }),
});

/** Library */

export const libraries = sqliteTable(
  'libraries',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }), // null = public/global
    name: text('name').notNull(),
    description: text('description'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_libraries_workspace').on(table.workspace_id),
    unique('unique_libraries_workspace_name').on(table.workspace_id, table.name),
  ],
);

/** Workflow Definitions */

export const workflow_defs = sqliteTable(
  'workflow_defs',
  {
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    version: integer('version').notNull(),

    // Owner as discriminated union
    owner_type: text('owner_type', { enum: ['project', 'library'] }).notNull(),
    owner_id: text('owner_id').notNull(),

    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    input_schema: text('input_schema', { mode: 'json' }).$type<object>().notNull(),
    output_schema: text('output_schema', { mode: 'json' }).$type<object>().notNull(),
    output_mapping: text('output_mapping', { mode: 'json' }).$type<object>(),
    context_schema: text('context_schema', { mode: 'json' }).$type<object>(),

    initial_node_id: text('initial_node_id'),

    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index('idx_workflow_defs_owner').on(table.owner_type, table.owner_id),
    index('idx_workflow_defs_name_version').on(
      table.name,
      table.owner_type,
      table.owner_id,
      table.version,
    ),
  ],
);

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    workflow_def_id: text('workflow_def_id').notNull(),
    pinned_version: integer('pinned_version'), // null = always use latest
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_workflows_project').on(table.project_id),
    index('idx_workflows_def').on(table.workflow_def_id, table.pinned_version),
  ],
);

/** Graph Structure */

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').notNull(),
    ref: text('ref').notNull(),
    workflow_def_id: text('workflow_def_id').notNull(),
    workflow_def_version: integer('workflow_def_version').notNull(),
    name: text('name').notNull(),
    action_id: text('action_id').notNull(),
    action_version: integer('action_version').notNull(),

    input_mapping: text('input_mapping', { mode: 'json' }).$type<object>(),
    output_mapping: text('output_mapping', { mode: 'json' }).$type<object>(),

    // No branching logic - nodes only execute actions
    // All branching is specified on transitions
  },
  (table) => [
    primaryKey({ columns: [table.workflow_def_id, table.workflow_def_version, table.id] }),
    foreignKey({
      columns: [table.workflow_def_id, table.workflow_def_version],
      foreignColumns: [workflow_defs.id, workflow_defs.version],
    }),
    foreignKey({
      columns: [table.action_id, table.action_version],
      foreignColumns: [actions.id, actions.version],
    }),
    index('idx_nodes_workflow_def').on(table.workflow_def_id, table.workflow_def_version),
    index('idx_nodes_action').on(table.action_id, table.action_version),
    index('idx_nodes_ref').on(table.workflow_def_id, table.workflow_def_version, table.ref),
  ],
);

export const transitions = sqliteTable(
  'transitions',
  {
    id: text('id').notNull(),
    ref: text('ref'),
    workflow_def_id: text('workflow_def_id').notNull(),
    workflow_def_version: integer('workflow_def_version').notNull(),
    from_node_id: text('from_node_id').notNull(),
    to_node_id: text('to_node_id').notNull(),
    priority: integer('priority').notNull(),

    condition: text('condition', { mode: 'json' }).$type<object>(), // structured or expression
    spawn_count: integer('spawn_count'), // How many tokens to spawn (default: 1)
    foreach: text('foreach', { mode: 'json' }).$type<object>(), // foreach config
    synchronization: text('synchronization', { mode: 'json' }).$type<object>(), // fan-in config
    loop_config: text('loop_config', { mode: 'json' }).$type<object>(),
  },
  (table) => [
    primaryKey({ columns: [table.workflow_def_id, table.workflow_def_version, table.id] }),
    foreignKey({
      columns: [table.workflow_def_id, table.workflow_def_version],
      foreignColumns: [workflow_defs.id, workflow_defs.version],
    }),
    foreignKey({
      columns: [table.workflow_def_id, table.workflow_def_version, table.from_node_id],
      foreignColumns: [nodes.workflow_def_id, nodes.workflow_def_version, nodes.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workflow_def_id, table.workflow_def_version, table.to_node_id],
      foreignColumns: [nodes.workflow_def_id, nodes.workflow_def_version, nodes.id],
    }).onDelete('cascade'),
    index('idx_transitions_workflow_def').on(table.workflow_def_id, table.workflow_def_version),
    index('idx_transitions_from_node').on(table.from_node_id),
    index('idx_transitions_to_node').on(table.to_node_id),
    index('idx_transitions_ref').on(table.workflow_def_id, table.workflow_def_version, table.ref),
  ],
);

/** Actions */

export const actions = sqliteTable(
  'actions',
  {
    id: text('id').notNull(),
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

    implementation: text('implementation', { mode: 'json' }).$type<object>().notNull(), // discriminated by kind

    requires: text('requires', { mode: 'json' }).$type<object>(),
    produces: text('produces', { mode: 'json' }).$type<object>(),
    execution: text('execution', { mode: 'json' }).$type<object>(), // timeout, retry_policy
    idempotency: text('idempotency', { mode: 'json' }).$type<object>(),

    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.version] })],
);

/** AI Primitives */

export const prompt_specs = sqliteTable(
  'prompt_specs',
  {
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    version: integer('version').notNull(),

    system_prompt: text('system_prompt'),
    template: text('template').notNull(),
    template_language: text('template_language', {
      enum: ['handlebars', 'jinja2'],
    }).notNull(),

    requires: text('requires', { mode: 'json' }).$type<object>().notNull(),
    produces: text('produces', { mode: 'json' }).$type<object>().notNull(),
    examples: text('examples', { mode: 'json' }).$type<object>(),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),

    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.version] })],
);

export const model_profiles = sqliteTable('model_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  model_id: text('model_id').$type<ModelId>().notNull(),

  parameters: text('parameters', { mode: 'json' }).$type<ModelProfile['parameters']>().notNull(),
  execution_config: text('execution_config', { mode: 'json' }).$type<object>(),

  cost_per_1k_input_tokens: real('cost_per_1k_input_tokens').notNull(),
  cost_per_1k_output_tokens: real('cost_per_1k_output_tokens').notNull(),
});

/** Workflow Runs & Execution */

export const workflow_runs = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id),
    workflow_id: text('workflow_id')
      .notNull()
      .references(() => workflows.id),
    workflow_def_id: text('workflow_def_id').notNull(),
    workflow_version: integer('workflow_version').notNull(),

    status: text('status', {
      enum: ['running', 'completed', 'failed', 'waiting'],
    }).notNull(),

    context: text('context', { mode: 'json' }).$type<object>().notNull(), // Context (input, state, output, artifacts, _branch)
    active_tokens: text('active_tokens', { mode: 'json' }).$type<object[]>().notNull(), // Token[]

    durable_object_id: text('durable_object_id').notNull(),
    latest_snapshot: text('latest_snapshot', { mode: 'json' }).$type<object>(), // Snapshot

    parent_run_id: text('parent_run_id'), // self-reference to workflow_runs.id (enforced at application level)
    parent_node_id: text('parent_node_id'),

    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
    completed_at: text('completed_at'),
  },
  (table) => [
    foreignKey({
      columns: [table.workflow_def_id, table.workflow_version, table.parent_node_id],
      foreignColumns: [nodes.workflow_def_id, nodes.workflow_def_version, nodes.id],
    }),
    index('idx_workflow_runs_project').on(table.project_id),
    index('idx_workflow_runs_workflow').on(table.workflow_id),
    index('idx_workflow_runs_status').on(table.status),
    index('idx_workflow_runs_parent').on(table.parent_run_id),
    index('idx_workflow_runs_created_at').on(table.created_at),
  ],
);

export const events = sqliteTable(
  'events',
  {
    workflow_run_id: text('workflow_run_id')
      .notNull()
      .references(() => workflow_runs.id, { onDelete: 'cascade' }),
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

    payload: text('payload', { mode: 'json' }).$type<object>().notNull(),
    timestamp: text('timestamp').notNull(),
    archived_at: text('archived_at'), // when moved to R2 (30-day retention policy)
  },
  (table) => [
    primaryKey({ columns: [table.workflow_run_id, table.sequence_number] }),
    index('idx_events_timestamp').on(table.timestamp),
    index('idx_events_kind').on(table.kind),
    index('idx_events_archived_at').on(table.archived_at),
  ],
);

/** Artifacts */

export const artifact_types = sqliteTable(
  'artifact_types',
  {
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    schema: text('schema', { mode: 'json' }).$type<object>().notNull(),
    version: integer('version').notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.version] })],
);

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id),
    type_id: text('type_id').notNull(),
    type_version: integer('type_version').notNull(),

    content: text('content', { mode: 'json' }).$type<object>().notNull(),

    created_by_workflow_run_id: text('created_by_workflow_run_id').references(
      () => workflow_runs.id,
    ),
    created_by_workflow_def_id: text('created_by_workflow_def_id'),
    created_by_workflow_def_version: integer('created_by_workflow_def_version'),
    created_by_node_id: text('created_by_node_id'),

    created_at: text('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.created_by_workflow_def_id,
        table.created_by_workflow_def_version,
        table.created_by_node_id,
      ],
      foreignColumns: [nodes.workflow_def_id, nodes.workflow_def_version, nodes.id],
    }),
    index('idx_artifacts_project_type').on(table.project_id, table.type_id),
    index('idx_artifacts_workflow_run').on(table.created_by_workflow_run_id),
    index('idx_artifacts_created_at').on(table.created_at),
  ],
);

/** MCP Servers */

export const mcp_servers = sqliteTable(
  'mcp_servers',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),

    // Connection configuration
    transport_type: text('transport_type', { enum: ['stdio', 'sse'] }).notNull(),
    command: text('command'), // for stdio
    args: text('args', { mode: 'json' }).$type<string[]>(), // string[] for stdio
    url: text('url'), // for SSE

    environment_variables: text('environment_variables', { mode: 'json' }).$type<
      Record<string, string>
    >(), // Record<string, string>

    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_mcp_servers_workspace').on(table.workspace_id),
    unique('unique_mcp_servers_workspace_name').on(table.workspace_id, table.name),
  ],
);

/** Event Sources */

export const event_sources = sqliteTable(
  'event_sources',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),

    source_type: text('source_type', { enum: ['webhook', 'polling', 'stream'] }).notNull(),
    config: text('config', { mode: 'json' }).$type<object>().notNull(), // discriminated by source_type

    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_event_sources_workspace').on(table.workspace_id),
    unique('unique_event_sources_workspace_name').on(table.workspace_id, table.name),
  ],
);

/** Vector Search */

export const vector_indexes = sqliteTable('vector_indexes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  vectorize_index_id: text('vectorize_index_id').notNull().unique('unique_vectorize_index_id'),

  artifact_type_ids: text('artifact_type_ids', { mode: 'json' }).$type<string[]>().notNull(),
  embedding_provider: text('embedding_provider', {
    enum: ['openai', 'cloudflare_ai'],
  }).notNull(),
  embedding_model: text('embedding_model').notNull(),
  dimensions: integer('dimensions').notNull(),

  content_fields: text('content_fields', { mode: 'json' }).$type<string[]>().notNull(),
  auto_index: integer('auto_index', { mode: 'boolean' }).notNull().default(false),

  created_at: text('created_at').notNull(),
});

/** Triggers */

export const triggers = sqliteTable(
  'triggers',
  {
    id: text('id').primaryKey(),
    workflow_id: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    kind: text('kind', { enum: ['webhook', 'schedule', 'event'] }).notNull(),
    config: text('config', { mode: 'json' }).$type<object>().notNull(), // discriminated by kind

    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at').notNull(),
  },
  (table) => [
    index('idx_triggers_workflow').on(table.workflow_id),
    index('idx_triggers_kind').on(table.kind, table.enabled),
  ],
);

/** Auth & Permissions */

export const actors = sqliteTable(
  'actors',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: ['human', 'system'] }).notNull(),
    name: text('name').notNull(),
    email: text('email'),
    permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull(), // Permission[]
    created_at: text('created_at').notNull(),
  },
  (table) => [unique('unique_actors_email').on(table.email)],
);

/** Secrets */

export const secrets = sqliteTable(
  'secrets',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text('key').notNull(), // e.g., 'ANTHROPIC_API_KEY', 'MCP_GITHUB_TOKEN'
    encrypted_value: text('encrypted_value').notNull(), // Encrypted at rest (base64-encoded)
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [unique('unique_secrets_workspace_key').on(table.workspace_id, table.key)],
);
