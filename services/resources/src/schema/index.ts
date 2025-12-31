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
import type { Condition, ForeachConfig, LoopConfig, SynchronizationConfig } from './types';

// Re-export schema types for consumers
export type { RetryConfig, Step } from '../resources/tasks/types';
export type {
  Condition,
  ForeachConfig,
  LoopConfig,
  MergeConfig,
  SynchronizationConfig,
} from './types';

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
    description: text().notNull().default(''),
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

    // Task execution (5-layer model: WorkflowDef → Node → Task → Step → ActionDef)
    // Mutually exclusive with subworkflowId
    taskId: text(),
    taskVersion: integer(),

    // Subworkflow execution (node dispatches to child coordinator)
    // Mutually exclusive with taskId
    subworkflowId: text(),
    subworkflowVersion: integer(),

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

    condition: text({ mode: 'json' }).$type<Condition>(),
    spawnCount: integer(),
    siblingGroup: text(),
    foreach: text({ mode: 'json' }).$type<ForeachConfig>(),
    synchronization: text({ mode: 'json' }).$type<SynchronizationConfig>(),
    loopConfig: text({ mode: 'json' }).$type<LoopConfig>(),
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
    description: text().notNull().default(''),
    version: integer().notNull().default(1),

    kind: text({
      enum: ['llm', 'mcp', 'http', 'human', 'context', 'artifact', 'vector', 'metric', 'mock'],
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
    description: text().notNull().default(''),

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
    index('idx_tasks_name_version').on(table.name, table.projectId, table.libraryId, table.version),
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
    description: text().notNull().default(''),
    version: integer().notNull().default(1),

    systemPrompt: text(),
    template: text().notNull(),

    requires: text({ mode: 'json' }).$type<object>().notNull().default({}),
    produces: text({ mode: 'json' }).$type<object>().notNull().default({}),
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

  parameters: text({ mode: 'json' }).$type<ModelProfile['parameters']>().notNull().default({}),
  executionConfig: text({ mode: 'json' }).$type<object>(),

  costPer1kInputTokens: real('cost_per_1k_input_tokens').notNull().default(0),
  costPer1kOutputTokens: real('cost_per_1k_output_tokens').notNull().default(0),

  createdAt: text().notNull(),
  updatedAt: text().notNull(),
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

    rootRunId: text().notNull(), // top-level run ID (equals id for top-level runs)
    parentRunId: text(), // self-reference to workflow_runs.id (enforced at application level)
    parentNodeId: text(),
    parentTokenId: text(), // which parent token to resume when sub-workflow completes

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
    index('idx_workflow_runs_root').on(table.rootRunId),
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
    description: text().notNull().default(''),
    schema: text({ mode: 'json' }).$type<object>().notNull(),
    version: integer().notNull().default(1),

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

/** Agent Primitives */

/**
 * Persona: Shareable identity, behavior, and tool configuration.
 * Versioned, lives in libraries.
 * @see docs/architecture/agent.md
 */
export const personas = sqliteTable(
  'personas',
  {
    id: text().notNull(),
    version: integer().notNull().default(1),
    name: text().notNull(),
    description: text().notNull().default(''),

    // Ownership (exactly one)
    libraryId: text().references(() => libraries.id),

    // Identity
    systemPrompt: text().notNull(),
    modelProfileId: text()
      .notNull()
      .references(() => modelProfiles.id),

    // Memory configuration
    contextAssemblyWorkflowId: text().notNull(),
    memoryExtractionWorkflowId: text().notNull(),
    recentTurnsLimit: integer().notNull().default(20),

    // Tools
    toolIds: text({ mode: 'json' }).$type<string[]>().notNull(),
    constraints: text({ mode: 'json' }).$type<{
      maxMovesPerTurn?: number;
    }>(),

    contentHash: text(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index('idx_personas_library').on(table.libraryId),
    index('idx_personas_name_version').on(table.name, table.libraryId, table.version),
    index('idx_personas_content_hash').on(table.name, table.libraryId, table.contentHash),
  ],
);

/**
 * Tool: LLM-facing interface to execution primitives.
 * Lives in libraries alongside Workflows, Tasks, and Personas.
 * @see docs/architecture/agent.md
 */
export const tools = sqliteTable(
  'tools',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    description: text().notNull(),

    // Ownership (exactly one)
    libraryId: text().references(() => libraries.id),

    // Schema for LLM
    inputSchema: text({ mode: 'json' }).$type<object>().notNull(),

    // Execution target
    targetType: text({ enum: ['task', 'workflow', 'agent'] }).notNull(),
    targetId: text().notNull(),

    // Execution options
    async: integer({ mode: 'boolean' }).notNull().default(false),
    invocationMode: text({ enum: ['delegate', 'loop_in'] }), // Only for agent targets
    inputMapping: text({ mode: 'json' }).$type<Record<string, string>>(),

    // Retry configuration
    retry: text({ mode: 'json' }).$type<{
      maxAttempts: number;
      backoffMs: number;
      timeoutMs: number;
    }>(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [
    index('idx_tools_library').on(table.libraryId),
    index('idx_tools_name').on(table.name, table.libraryId),
    index('idx_tools_target').on(table.targetType, table.targetId),
  ],
);

/**
 * Agent: Persona + memory, scoped to projects.
 * The living instance that accumulates knowledge across conversations.
 * @see docs/architecture/agent.md
 */
export const agents = sqliteTable(
  'agents',
  {
    id: text().primaryKey(),

    // Project scope (one or more)
    projectIds: text({ mode: 'json' }).$type<string[]>().notNull(),

    // Persona reference (either inline or library reference)
    personaId: text(),
    personaVersion: integer(),

    // Memory corpus is stored separately (D1 + Vectorize + R2), keyed by agent_id

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [index('idx_agents_persona').on(table.personaId, table.personaVersion)],
);

/**
 * Conversation: A session with an agent.
 * Multi-party collaboration space with participants, messages, and turns.
 * @see docs/architecture/agent.md
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text().primaryKey(),

    // Participants (users and agents)
    participants: text({ mode: 'json' })
      .$type<Array<{ type: 'user'; userId: string } | { type: 'agent'; agentId: string }>>()
      .notNull(),

    status: text({ enum: ['active', 'waiting', 'completed', 'failed'] }).notNull(),

    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (table) => [index('idx_conversations_status').on(table.status)],
);

// Legacy snake_case exports for backward compatibility during migration
// TODO: Remove these after all consumers are updated
export {
  artifactTypes as artifact_types,
  eventSources as event_sources,
  mcpServers as mcp_servers,
  modelProfiles as model_profiles,
  projectSettings as project_settings,
  promptSpecs as prompt_specs,
  vectorIndexes as vector_indexes,
  workflowDefs as workflow_defs,
  workflowRuns as workflow_runs,
  workspaceSettings as workspace_settings,
};
