/** WONDER WORKFLOW PRIMITIVES - AI Workflow Orchestration System */

/** Type System */

export type SchemaType = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'artifact_ref';
  properties?: Record<string, SchemaType>;
  required?: string[];
  items?: SchemaType;
  artifact_type_id?: string;
};

export type ArtifactType = {
  id: string;
  name: string;
  description: string;
  schema: Record<string, SchemaType>;
  version: number;
};

/** Workspace & Project */

export type Workspace = {
  id: string;
  name: string;

  settings?: WorkspaceSettings;

  created_at: string;
  updated_at: string;
};

export type WorkspaceSettings = {
  allowed_model_providers?: ModelProvider[];
  allowed_mcp_servers?: string[];

  budget?: {
    max_monthly_spend_cents?: number;
    alert_threshold_cents?: number;
  };
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;

  settings?: ProjectSettings;

  created_at: string;
  updated_at: string;
};

export type ProjectSettings = {
  default_model_profile_id?: string;

  rate_limits?: {
    max_concurrent_runs?: number;
    max_llm_calls_per_hour?: number;
  };

  budget?: {
    max_monthly_spend_cents?: number;
    alert_threshold_cents?: number;
  };

  snapshot_policy?: {
    every_n_events?: number; // e.g., 100
    every_n_seconds?: number; // e.g., 60
    on_fan_in_complete?: boolean; // natural checkpoint after merge
  };
};

/** Library */

export type Library = {
  id: string;
  workspace_id?: string; // null = public/global
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

/** Workflow & Workflow Definition */

export type WorkflowDefOwner =
  | { type: 'project'; project_id: string }
  | { type: 'library'; library_id: string };

export type WorkflowDef = {
  id: string;
  name: string;
  description: string;
  version: number;

  owner: WorkflowDefOwner;

  // UI/discovery hints, not type distinctions
  // Use to categorize as "routine" vs top-level "workflow" in UI
  tags?: string[];

  input_schema: Record<string, SchemaType>;
  output_schema: Record<string, SchemaType>;
  context_schema?: Record<string, SchemaType>;

  initial_node_id: string;

  created_at: string;
  updated_at: string;
};

// Project-bound workflow (has triggers, runs, dashboards)
export type Workflow = {
  id: string;
  project_id: string;
  name: string;
  description: string;

  // Can reference project-local or library WorkflowDef
  workflow_def_id: string;

  // If referencing library def, optionally pin to version
  // null = always use latest
  pinned_version?: number;

  triggers?: TriggerDef[];
  enabled: boolean;

  created_at: string;
  updated_at: string;
};

export type WorkflowRun = {
  id: string;
  project_id: string;
  workflow_id: string;
  workflow_def_id: string;
  workflow_version: number;

  status: WorkflowRunStatus;

  context: Context;
  active_tokens: Token[];

  durable_object_id: string;

  // Snapshot for fast state recovery (avoids replaying full event log)
  latest_snapshot?: Snapshot;

  // For nested workflow calls: track parent relationship
  parent_run_id?: string;
  parent_node_id?: string;

  created_at: string;
  updated_at: string;
  completed_at?: string;
};

export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'waiting';

export type Snapshot = {
  after_sequence_number: number; // replay events after this
  context: Context;
  tokens: Token[];
  created_at: string;
};

/** Graph Structure: Nodes */

export type NodeDef = {
  id: string; // ULID (server-assigned)
  ref: string; // human-readable reference (client-provided, unique per workflow)
  workflow_def_id: string;
  name: string;

  // The action this node executes
  action_id: string; // ULID reference to action

  // Data flow mappings
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;

  // Parallelism semantics
  fan_out: 'first_match' | 'all';
  fan_in: 'any' | 'all' | { m_of_n: number };

  // For fan_in nodes: which fan_out node spawned the tokens we're joining?
  // Required when fan_in is 'all' or 'm_of_n' to identify sibling tokens
  joins_node?: string; // ULID reference to node (resolved from joins_node_ref at creation)

  // Merge strategy when fan_in collects multiple branch outputs
  merge?: {
    source?: string; // path within _branch.output, default '*' (all)
    target: string; // path in state to write merged result
    strategy: 'append' | 'merge_object' | 'keyed_by_branch' | 'last_wins';
  };

  // Behavior when m_of_n satisfied early
  on_early_complete?: 'cancel' | 'abandon' | 'allow_late_merge';
};

/** Graph Structure: Transitions */

export type TransitionDef = {
  id: string; // ULID (server-assigned)
  ref?: string; // optional human-readable reference
  workflow_def_id: string;
  from_node_id: string; // ULID reference (resolved from from_node_ref at creation)
  to_node_id: string; // ULID reference (resolved from to_node_ref at creation)
  priority: number;

  condition?:
    | { type: 'structured'; definition: StructuredCondition }
    | { type: 'expression'; expr: string; reads: string[] };

  // Dynamic iteration: spawn a token for each item in collection
  foreach?: {
    collection: string; // path to array in context
    item_var: string; // variable name for current item
  };

  loop_config?: {
    max_iterations?: number;
    timeout_ms?: number;
  };
};

/** Structured Conditions */

export type StructuredCondition =
  | ComparisonCondition
  | ExistsCondition
  | InSetCondition
  | ArrayCondition
  | BooleanCondition;

export type ComparisonCondition = {
  type: 'comparison';
  left: FieldRef | LiteralValue;
  operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
  right: FieldRef | LiteralValue;
};

export type FieldRef = {
  type: 'field';
  path: string;
};

export type LiteralValue = {
  type: 'literal';
  value: string | number | boolean;
};

export type ExistsCondition = {
  type: 'exists';
  field: FieldRef;
  negated?: boolean;
};

export type InSetCondition = {
  type: 'in_set';
  field: FieldRef;
  values: LiteralValue[];
  negated?: boolean;
};

export type ArrayCondition = {
  type: 'array_length';
  field: FieldRef;
  operator: '>' | '<' | '==' | '>=' | '<=';
  value: number | FieldRef;
};

export type BooleanCondition = {
  type: 'and' | 'or';
  conditions: StructuredCondition[];
};

/** Actions */

export type ActionKind =
  | 'llm_call'
  | 'mcp_tool'
  | 'http_request'
  | 'human_input'
  | 'update_context'
  | 'write_artifact'
  | 'workflow_call'
  | 'vector_search'
  | 'emit_metric';

export type ActionDef = {
  id: string;
  name: string;
  description: string;
  version: number;

  kind: ActionKind;

  implementation:
    | LLMCallImpl
    | MCPToolImpl
    | HTTPRequestImpl
    | HumanInputImpl
    | UpdateContextImpl
    | WriteArtifactImpl
    | WorkflowCallImpl
    | VectorSearchImpl
    | EmitMetricImpl;

  requires?: Record<string, SchemaType>;
  produces?: Record<string, SchemaType>;

  execution?: {
    timeout_ms?: number;
    retry_policy?: {
      max_attempts: number;
      backoff: 'none' | 'linear' | 'exponential';
      initial_delay_ms: number;
      max_delay_ms?: number;
      retryable_errors?: string[];
    };
  };

  idempotency?: {
    key_template: string;
    ttl_seconds?: number;
  };

  created_at: string;
  updated_at: string;
};

export type LLMCallImpl = {
  prompt_spec_id: string;
  model_profile_id: string;
};

export type MCPToolImpl = {
  mcp_server_id: string;
  tool_name: string;
};

export type HTTPRequestImpl = {
  url_template: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body_template?: string;
};

export type HumanInputImpl = {
  prompt: string;
  input_schema: Record<string, SchemaType>;
  timeout_ms?: number;
  required_permissions?: string[];
};

export type UpdateContextImpl = {
  updates: {
    path: string;
    expr: string;
  }[];
};

export type WriteArtifactImpl = {
  artifact_type_id: string;
  content_mapping: Record<string, string>;
};

export type WorkflowCallImpl = {
  // Reference to WorkflowDef (in library or local)
  // Static ID or dynamic from context
  workflow_def_id: string | { from_context: string };

  // Version pinning (for library defs)
  // undefined = latest, number = pinned, from_context = dynamic
  version?: number | { from_context: string };

  // Context isolation: does sub-workflow see parent's artifacts?
  inherit_artifacts?: boolean; // default false

  // Failure handling
  on_failure?: 'propagate' | 'catch'; // default 'propagate'
};

export type VectorSearchImpl = {
  vector_index_id: string;
  top_k: number;
  similarity_threshold?: number;
};

export type EmitMetricImpl = {
  metric_name: string;
  value: number | { expr: string };
  dimensions?: Record<string, string>;
};

/** AI Primitives */

export type PromptSpec = {
  id: string;
  name: string;
  description: string;
  version: number;

  system_prompt?: string;
  template: string;
  template_language: 'handlebars' | 'jinja2';

  requires: Record<string, SchemaType>;
  produces: Record<string, SchemaType>;

  examples?: {
    input: Record<string, unknown>;
    output: unknown;
  }[];

  tags?: string[];

  created_at: string;
  updated_at: string;
};

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'cloudflare' | 'local';

export type ModelProfile = {
  id: string;
  name: string;
  provider: ModelProvider;
  model_id: string;

  parameters: {
    temperature: number;
    max_tokens: number;
    top_p?: number;
    stop_sequences?: string[];
  };

  execution_config?: Record<string, unknown>;

  cost_per_1k_input_tokens: number;
  cost_per_1k_output_tokens: number;
};

/** Vector Search */

export type VectorIndex = {
  id: string;
  name: string;
  vectorize_index_id: string;

  artifact_type_ids: string[];

  embedding_provider: 'openai' | 'cloudflare_ai';
  embedding_model: string;
  dimensions: number;

  content_fields: string[];

  auto_index: boolean;

  created_at: string;
};

/** Triggers */

export type TriggerKind = 'webhook' | 'schedule' | 'event';

export type TriggerDef = {
  id: string;
  workflow_id: string;

  kind: TriggerKind;

  config: WebhookTriggerConfig | ScheduleTriggerConfig | EventTriggerConfig;

  enabled: boolean;
  created_at: string;
};

export type WebhookTriggerConfig = {
  path: string;
  secret?: string;
};

export type ScheduleTriggerConfig = {
  cron_expr: string;
  time_zone?: string;
};

export type EventTriggerConfig = {
  event_source_id: string;
  event_pattern: {
    event_types?: string[];
    filters?: StructuredCondition;
  };
};

/** Runtime: Tokens */

export type TokenStatus = 'active' | 'waiting_at_fan_in' | 'completed' | 'cancelled';

export type Token = {
  id: string;
  workflow_run_id: string;
  current_node_id: string;
  status: TokenStatus;

  // Execution path identifier (for tracing/debugging)
  path_id: string;

  // Fan-out lineage tracking
  parent_token_id?: string;
  fan_out_node_id?: string; // which node spawned this token
  branch_index: number;
  branch_total: number;

  created_at: string;
  updated_at: string;
};

/** Runtime: Context */

export type Context = {
  // Immutable inputs (validated against workflow.input_schema)
  input: Record<string, unknown>;

  // Mutable state accumulated during execution
  state: Record<string, unknown>;

  // Final output (validated against workflow.output_schema)
  // Set by final node before workflow completes
  output?: Record<string, unknown>;

  // References to artifacts by name -> artifact_id
  artifacts: Record<string, string>;

  // Present during fan-out execution, cleared after fan-in merge
  _branch?: BranchContext;
};

export type BranchContext = {
  id: string; // token id
  index: number; // 0-indexed position
  total: number; // sibling count
  fan_out_node_id: string; // which node spawned this branch

  // Isolated output space for this branch
  output: Record<string, unknown>;

  // For nested fan-outs
  parent?: BranchContext;
};

/** Runtime: Artifacts */

export type Artifact = {
  id: string;
  project_id: string; // artifacts are project-scoped

  type_id: string;
  type_version: number;
  content: Record<string, unknown>;

  created_by_workflow_run_id?: string;
  created_by_node_id?: string;

  created_at: string;
};

/** Runtime: Events (for event sourcing) */

export type EventKind =
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'workflow_waiting'
  | 'workflow_resumed'
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'transition_taken'
  | 'token_spawned'
  | 'token_merged'
  | 'token_cancelled'
  | 'artifact_created'
  | 'context_updated'
  | 'subworkflow_started'
  | 'subworkflow_completed';

export type Event = {
  id: string;
  workflow_run_id: string;
  sequence_number: number;

  kind: EventKind;
  payload: Record<string, unknown>;

  timestamp: string;
};

/** Execution Queue */

export type WorkflowTask = {
  workflow_run_id: string;
  token_id: string;
  node_id: string;

  // Snapshot of data needed to execute
  input_data: Record<string, unknown>;

  // Branch context passed to worker (if inside fan_out)
  branch?: {
    id: string;
    index: number;
    total: number;
  };

  retry_count: number;
  created_at: string;
};

export type WorkflowTaskResult = {
  workflow_run_id: string;
  token_id: string;
  node_id: string;

  status: 'success' | 'failure';

  // Branch output—staged here, not written to context directly
  // Fan-in node collects these and applies merge strategy
  output_data?: Record<string, unknown>;

  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };

  execution_time_ms: number;
  timestamp: string;
};

/** Auth & Permissions */

export type ActorType = 'human' | 'system';

export type Actor = {
  id: string;
  type: ActorType;
  name: string;
  email?: string;
  permissions: Permission[];
  created_at: string;
};

export type ResourceType = 'workflow' | 'workflow_run' | 'artifact' | 'project';
export type ActionType = 'read' | 'write' | 'execute' | 'delete';

export type Permission = {
  resource_type: ResourceType;
  resource_id?: string;
  actions: ActionType[];
};
