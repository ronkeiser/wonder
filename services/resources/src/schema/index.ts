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

import type { ModelId, ModelProfile } from '../resources/model-profiles/types';
import type { RetryConfig, Step } from '../resources/tasks/types';

// Re-export for consumers that import from schema
export type { RetryConfig, Step } from '../resources/tasks/types';

/** Workspace & Project */

export const workspaces = sqliteTable('workspaces', {
  id: text().primaryKey(),
  name: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
});

export const workspaceSettings = sqliteTable('workspace_settings', {
  workspaceId: text()
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  allowedModelProviders: text({ mode: 'json' }).$type<string[]>(),
  allowedMcpServers: text({ mode: 'json' }).$type<string[]>(),
  budgetMaxMonthlySpendCents: integer(),
  budgetAlertThresholdCents: integer(),
});

export const projects = sqliteTable(
  'projects',
  {
    id: text().primaryKey(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [index('idx_projects_workspace').on(table.workspaceId)],
);

export const projectSettings = sqliteTable('project_settings', {
  projectId: text()
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  defaultModelProfileId: text(),
  rateLimitMaxConcurrentRuns: integer(),
  rateLimitMaxLlmCallsPerHour: integer(),
  budgetMaxMonthlySpendCents: integer(),
  budgetAlertThresholdCents: integer(),
  snapshotPolicyEveryNEvents: integer(),
  snapshotPolicyEveryNSeconds: integer(),
  snapshotPolicyOnFanInComplete: integer({
    mode: 'boolean',
  }),
});

/** Library */

export const libraries = sqliteTable(
  'libraries',
  {
    id: text().primaryKey(),
    workspaceId: text().references(() => workspaces.id, { onDelete: 'cascade' }), // null = public/global
    name: text().notNull(),
    description: text(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    index('idx_libraries_workspace').on(table.workspaceId),
    unique('unique_libraries_workspace_name').on(table.workspaceId, table.name),
  ],
);

/** Workflow Definitions */

export const workflowDefs = sqliteTable(
  'workflow_defs',
  {
    id: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    version: integer().notNull().default(1),

    projectId: text().references(() => projects.id),
    libraryId: text(),

    tags: text({ mode: 'json' }).$type<string[]>(),
    inputSchema: text({ mode: 'json' }).$type<object>().notNull(),
    outputSchema: text({ mode: 'json' }).$type<object>().notNull(),
    outputMapping: text({ mode: 'json' }).$type<object>(),
    contextSchema: text({ mode: 'json' }).$type<object>(),

    initialNodeId: text(),

    contentHash: text(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index('idx_workflow_defs_project').on(table.projectId),
    index('idx_workflow_defs_library').on(table.libraryId),
    index('idx_workflow_defs_name_version').on(
      table.name,
      table.projectId,
      table.libraryId,
      table.version,
    ),
    index('idx_workflow_defs_content_hash').on(
      table.name,
      table.projectId,
      table.libraryId,
      table.contentHash,
    ),
  ],
);

export const workflows = sqliteTable(
  'workflows',
  {
    id: text().primaryKey(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text().notNull(),
    workflowDefId: text().notNull(),
    pinnedVersion: integer(), // null = always use latest
    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    index('idx_workflows_project').on(table.projectId),
    index('idx_workflows_def').on(table.workflowDefId, table.pinnedVersion),
  ],
);

/** Graph Structure */

export const nodes = sqliteTable(
  'nodes',
  {
    id: text().notNull(),
    ref: text().notNull(),
    workflowDefId: text().notNull(),
    workflowDefVersion: integer().notNull(),
    name: text().notNull(),

    // Task execution (5-layer model: WorkflowDef → Node → TaskDef → Step → ActionDef)
    taskId: text(),
    taskVersion: integer(),

    inputMapping: text({ mode: 'json' }).$type<object>(),
    outputMapping: text({ mode: 'json' }).$type<object>(),

    // Map generic resource names (used by actions/tools) to workflow-specific resource IDs
    // Example: { "container": "dev_env", "build_env": "build_container" }
    resourceBindings: text({ mode: 'json' }).$type<Record<string, string>>(),

    // No branching logic - nodes only execute tasks
    // All branching is specified on transitions
  },
  (table) => [
    primaryKey({ columns: [table.workflowDefId, table.workflowDefVersion, table.id] }),
    foreignKey({
      columns: [table.workflowDefId, table.workflowDefVersion],
      foreignColumns: [workflowDefs.id, workflowDefs.version],
    }),
    index('idx_nodes_workflow_def').on(table.workflowDefId, table.workflowDefVersion),
    index('idx_nodes_task').on(table.taskId, table.taskVersion),
    index('idx_nodes_ref').on(table.workflowDefId, table.workflowDefVersion, table.ref),
  ],
);

export const transitions = sqliteTable(
  'transitions',
  {
    id: text().notNull(),
    ref: text(),
    workflowDefId: text().notNull(),
    workflowDefVersion: integer().notNull(),
    fromNodeId: text().notNull(),
    toNodeId: text().notNull(),
    priority: integer().notNull(),

    condition: text({ mode: 'json' }).$type<object>(), // structured or expression
    spawnCount: integer(), // How many tokens to spawn (default: 1)
    siblingGroup: text(), // Sibling group identifier for fan-in coordination
    foreach: text({ mode: 'json' }).$type<object>(), // foreach config
    synchronization: text({ mode: 'json' }).$type<object>(), // fan-in config
    loopConfig: text({ mode: 'json' }).$type<object>(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowDefId, table.workflowDefVersion, table.id] }),
    foreignKey({
      columns: [table.workflowDefId, table.workflowDefVersion],
      foreignColumns: [workflowDefs.id, workflowDefs.version],
    }),
    foreignKey({
      columns: [table.workflowDefId, table.workflowDefVersion, table.fromNodeId],
      foreignColumns: [nodes.workflowDefId, nodes.workflowDefVersion, nodes.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.workflowDefId, table.workflowDefVersion, table.toNodeId],
      foreignColumns: [nodes.workflowDefId, nodes.workflowDefVersion, nodes.id],
    }).onDelete('cascade'),
    index('idx_transitions_workflow_def').on(table.workflowDefId, table.workflowDefVersion),
    index('idx_transitions_from_node').on(table.fromNodeId),
    index('idx_transitions_to_node').on(table.toNodeId),
    index('idx_transitions_ref').on(table.workflowDefId, table.workflowDefVersion, table.ref),
  ],
);

/** Actions */

export const actions = sqliteTable(
  'actions',
  {
    id: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    version: integer().notNull(),

    kind: text({
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
        'mock',
      ],
    }).notNull(),

    implementation: text({ mode: 'json' }).$type<object>().notNull(), // discriminated by kind

    requires: text({ mode: 'json' }).$type<object>(),
    produces: text({ mode: 'json' }).$type<object>(),
    execution: text({ mode: 'json' }).$type<object>(), // timeout, retry_policy
    idempotency: text({ mode: 'json' }).$type<object>(),

    contentHash: text(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index('idx_actions_content_hash').on(table.name, table.contentHash),
  ],
);

/** Tasks - Intermediate layer between Node and Action */

export const tasks = sqliteTable(
  'tasks',
  {
    id: text().notNull(),
    version: integer().notNull().default(1),
    name: text().notNull(),
    description: text().notNull(),

    // Ownership (exactly one)
    projectId: text().references(() => projects.id),
    libraryId: text(),

    tags: text({ mode: 'json' }).$type<string[]>(),

    inputSchema: text({ mode: 'json' }).$type<object>().notNull(),
    outputSchema: text({ mode: 'json' }).$type<object>().notNull(),

    // Steps are embedded (not a separate table)
    steps: text({ mode: 'json' }).$type<Step[]>().notNull(),

    retry: text({ mode: 'json' }).$type<RetryConfig>(),
    timeoutMs: integer(),

    contentHash: text(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index('idx_tasks_project').on(table.projectId),
    index('idx_tasks_library').on(table.libraryId),
    index('idx_tasks_name_version').on(
      table.name,
      table.projectId,
      table.libraryId,
      table.version,
    ),
    index('idx_tasks_content_hash').on(
      table.name,
      table.projectId,
      table.libraryId,
      table.contentHash,
    ),
  ],
);

/** AI Primitives */

export const promptSpecs = sqliteTable(
  'prompt_specs',
  {
    id: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    version: integer().notNull(),

    systemPrompt: text(),
    template: text().notNull(),

    requires: text({ mode: 'json' }).$type<object>().notNull(),
    produces: text({ mode: 'json' }).$type<object>().notNull(),
    examples: text({ mode: 'json' }).$type<object>(),
    tags: text({ mode: 'json' }).$type<string[]>(),

    contentHash: text(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index('idx_prompt_specs_content_hash').on(table.name, table.contentHash),
  ],
);

export const modelProfiles = sqliteTable('model_profiles', {
  id: text().primaryKey(),
  name: text().notNull(),
  provider: text().notNull(),
  modelId: text().$type<ModelId>().notNull(),

  parameters: text({ mode: 'json' }).$type<ModelProfile['parameters']>().notNull(),
  executionConfig: text({ mode: 'json' }).$type<object>(),

  costPer1kInputTokens: real().notNull(),
  costPer1kOutputTokens: real().notNull(),
});

/** Workflow Runs & Execution */

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text().primaryKey(),
    projectId: text()
      .notNull()
      .references(() => projects.id),
    workflowId: text()
      .notNull()
      .references(() => workflows.id),
    workflowDefId: text().notNull(),
    workflowVersion: integer().notNull(),

    status: text({
      enum: ['running', 'completed', 'failed', 'waiting'],
    }).notNull(),

    context: text({ mode: 'json' }).$type<object>().notNull(), // Context (input, state, output, artifacts, _branch)
    activeTokens: text({ mode: 'json' }).$type<object[]>().notNull(), // Token[]

    durableObjectId: text().notNull(),
    latestSnapshot: text({ mode: 'json' }).$type<object>(), // Snapshot

    parentRunId: text(), // self-reference to workflow_runs.id (enforced at application level)
    parentNodeId: text(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
    completedAt: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.workflowDefId, table.workflowVersion, table.parentNodeId],
      foreignColumns: [nodes.workflowDefId, nodes.workflowDefVersion, nodes.id],
    }),
    index('idx_workflow_runs_project').on(table.projectId),
    index('idx_workflow_runs_workflow').on(table.workflowId),
    index('idx_workflow_runs_status').on(table.status),
    index('idx_workflow_runs_parent').on(table.parentRunId),
    index('idx_workflow_runs_created_at').on(table.createdAt),
  ],
);

export const events = sqliteTable(
  'events',
  {
    workflowRunId: text()
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    sequenceNumber: integer().notNull(),

    kind: text({
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

    payload: text({ mode: 'json' }).$type<object>().notNull(),
    timestamp: text().notNull(),
    archivedAt: text(), // when moved to R2 (30-day retention policy)
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.sequenceNumber] }),
    index('idx_events_timestamp').on(table.timestamp),
    index('idx_events_kind').on(table.kind),
    index('idx_events_archived_at').on(table.archivedAt),
  ],
);

/** Artifacts */

export const artifactTypes = sqliteTable(
  'artifact_types',
  {
    id: text().notNull(),
    name: text().notNull(),
    description: text().notNull(),
    schema: text({ mode: 'json' }).$type<object>().notNull(),
    version: integer().notNull(),

    contentHash: text(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index('idx_artifact_types_content_hash').on(table.name, table.contentHash),
  ],
);

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text().primaryKey(),
    projectId: text()
      .notNull()
      .references(() => projects.id),
    typeId: text().notNull(),
    typeVersion: integer().notNull(),

    content: text({ mode: 'json' }).$type<object>().notNull(),

    createdByWorkflowRunId: text().references(() => workflowRuns.id),
    createdByWorkflowDefId: text(),
    createdByWorkflowDefVersion: integer(),
    createdByNodeId: text(),

    createdAt: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.createdByWorkflowDefId,
        table.createdByWorkflowDefVersion,
        table.createdByNodeId,
      ],
      foreignColumns: [nodes.workflowDefId, nodes.workflowDefVersion, nodes.id],
    }),
    index('idx_artifacts_project_type').on(table.projectId, table.typeId),
    index('idx_artifacts_workflow_run').on(table.createdByWorkflowRunId),
    index('idx_artifacts_created_at').on(table.createdAt),
  ],
);

/** MCP Servers */

export const mcpServers = sqliteTable(
  'mcp_servers',
  {
    id: text().primaryKey(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),

    // Connection configuration
    transportType: text({ enum: ['stdio', 'sse'] }).notNull(),
    command: text(), // for stdio
    args: text({ mode: 'json' }).$type<string[]>(), // string[] for stdio
    url: text(), // for SSE

    environmentVariables: text({ mode: 'json' }).$type<Record<string, string>>(), // Record<string, string>

    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    index('idx_mcp_servers_workspace').on(table.workspaceId),
    unique('unique_mcp_servers_workspace_name').on(table.workspaceId, table.name),
  ],
);

/** Event Sources */

export const eventSources = sqliteTable(
  'event_sources',
  {
    id: text().primaryKey(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),

    sourceType: text({ enum: ['webhook', 'polling', 'stream'] }).notNull(),
    config: text({ mode: 'json' }).$type<object>().notNull(), // discriminated by source_type

    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    index('idx_event_sources_workspace').on(table.workspaceId),
    unique('unique_event_sources_workspace_name').on(table.workspaceId, table.name),
  ],
);

/** Vector Search */

export const vectorIndexes = sqliteTable('vector_indexes', {
  id: text().primaryKey(),
  name: text().notNull(),
  vectorizeIndexId: text().notNull().unique('unique_vectorize_index_id'),

  artifactTypeIds: text({ mode: 'json' }).$type<string[]>().notNull(),
  embeddingProvider: text({
    enum: ['openai', 'cloudflare_ai'],
  }).notNull(),
  embeddingModel: text().notNull(),
  dimensions: integer().notNull(),

  contentFields: text({ mode: 'json' }).$type<string[]>().notNull(),
  autoIndex: integer({ mode: 'boolean' }).notNull().default(false),

  createdAt: text().notNull(),
});

/** Triggers */

export const triggers = sqliteTable(
  'triggers',
  {
    id: text().primaryKey(),
    workflowId: text()
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    kind: text({ enum: ['webhook', 'schedule', 'event'] }).notNull(),
    config: text({ mode: 'json' }).$type<object>().notNull(), // discriminated by kind

    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: text().notNull(),
  },
  (table) => [
    index('idx_triggers_workflow').on(table.workflowId),
    index('idx_triggers_kind').on(table.kind, table.enabled),
  ],
);

/** Auth & Permissions */

export const actors = sqliteTable(
  'actors',
  {
    id: text().primaryKey(),
    type: text({ enum: ['human', 'system'] }).notNull(),
    name: text().notNull(),
    email: text(),
    permissions: text({ mode: 'json' }).$type<string[]>().notNull(), // Permission[]
    createdAt: text().notNull(),
  },
  (table) => [unique('unique_actors_email').on(table.email)],
);

/** Secrets */

export const secrets = sqliteTable(
  'secrets',
  {
    id: text().primaryKey(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text().notNull(), // e.g., 'ANTHROPIC_API_KEY', 'MCP_GITHUB_TOKEN'
    encryptedValue: text().notNull(), // Encrypted at rest (base64-encoded)
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [unique('unique_secrets_workspace_key').on(table.workspaceId, table.key)],
);

// Legacy snake_case exports for backward compatibility during migration
// TODO: Remove these after all consumers are updated
export {
  workspaceSettings as workspace_settings,
  projectSettings as project_settings,
  workflowDefs as workflow_defs,
  promptSpecs as prompt_specs,
  modelProfiles as model_profiles,
  workflowRuns as workflow_runs,
  artifactTypes as artifact_types,
  mcpServers as mcp_servers,
  eventSources as event_sources,
  vectorIndexes as vector_indexes,
};
