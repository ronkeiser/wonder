/**
 * JSON Schema property definition (subset we support)
 */
export interface JSONSchemaProperty {
  type?: string;
  properties?: Record<string, JSONSchemaProperty>;
  items?: JSONSchemaProperty;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  additionalProperties?: boolean | JSONSchemaProperty;
  allOf?: JSONSchemaProperty[];
  anyOf?: JSONSchemaProperty[];
  oneOf?: JSONSchemaProperty[];
  not?: JSONSchemaProperty;
  $ref?: string;
  title?: string;
  examples?: unknown[];
  nullable?: boolean;
}

/**
 * Source location in a document
 */
export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

// =============================================================================
// Workflow Types
// =============================================================================

export interface NodeDecl {
  ref?: string;
  name?: string;
  task_id?: string;
  task_version?: number;
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;
  resource_bindings?: Record<string, string>;
  _loc?: SourceLocation;
}

export interface ConditionDecl {
  type: 'structured' | 'expression';
  expr?: string;
  definition?: object;
  reads?: string[];
}

export interface ForeachConfig {
  collection: string;
  item_var: string;
}

export interface MergeConfig {
  source: string;
  target: string;
  strategy: 'append' | 'merge_object' | 'keyed_by_branch' | 'last_wins';
}

export interface SyncConfig {
  strategy: 'all' | 'any' | { m_of_n: number };
  sibling_group: string;
  timeout_ms?: number;
  on_timeout?: 'proceed_with_available' | 'fail';
  merge?: MergeConfig;
}

export interface LoopConfig {
  max_iterations?: number;
  timeout_ms?: number;
}

export interface TransitionDecl {
  from_node_ref?: string;
  to_node_ref?: string | null;
  priority?: number;
  condition?: ConditionDecl;
  spawn_count?: number;
  foreach?: ForeachConfig;
  synchronization?: SyncConfig;
  loop_config?: LoopConfig;
  _loc?: SourceLocation;
}

export interface ResourceDecl {
  type: 'container';
  image: string;
  repo_id: string;
  base_branch: string;
  merge_on_success: boolean;
  merge_strategy: 'rebase' | 'fail' | 'force';
}

export interface WflowDocument {
  imports?: Record<string, string>;
  workflow?: string;
  version?: number;
  description?: string;
  input_schema?: JSONSchemaProperty;
  context_schema?: JSONSchemaProperty;
  output_schema?: JSONSchemaProperty;
  resources?: Record<string, ResourceDecl>;
  nodes?: Record<string, NodeDecl>;
  transitions?: Record<string, TransitionDecl>;
  initial_node_ref?: string;
  timeout_ms?: number;
  on_timeout?: 'human_gate' | 'fail' | 'cancel_all';
  _loc?: SourceLocation;
}

// =============================================================================
// Task Types
// =============================================================================

export interface StepCondition {
  if: string;
  then: 'continue' | 'skip' | 'succeed' | 'fail';
  else: 'continue' | 'skip' | 'succeed' | 'fail';
}

export interface StepDecl {
  ref?: string;
  ordinal?: number;
  action_id?: string;
  action_version?: number;
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;
  on_failure?: 'abort' | 'retry' | 'continue';
  condition?: StepCondition;
  _loc?: SourceLocation;
}

export interface RetryConfig {
  max_attempts: number;
  backoff: 'none' | 'linear' | 'exponential';
  initial_delay_ms: number;
  max_delay_ms?: number;
}

export interface TaskDocument {
  imports?: Record<string, string>;
  task?: string;
  version?: number;
  name?: string;
  description?: string;
  tags?: string[];
  input_schema?: JSONSchemaProperty;
  output_schema?: JSONSchemaProperty;
  steps?: StepDecl[];
  retry?: RetryConfig;
  timeout_ms?: number;
  _loc?: SourceLocation;
}

// =============================================================================
// Action Types
// =============================================================================

export type ActionKind =
  | 'llm'
  | 'mcp'
  | 'http'
  | 'tool'
  | 'shell'
  | 'workflow'
  | 'context'
  | 'vector'
  | 'metric'
  | 'human';

export interface ActionRetryPolicy {
  max_attempts: number;
  backoff: 'none' | 'linear' | 'exponential';
  initial_delay_ms: number;
  max_delay_ms?: number;
  retryable_errors?: string[];
}

export interface ActionExecution {
  timeout_ms?: number;
  retry_policy?: ActionRetryPolicy;
}

export interface ActionIdempotency {
  key_template: string;
  ttl_seconds?: number;
}

export interface ActionDocument {
  imports?: Record<string, string>;
  action?: string;
  version?: number;
  name?: string;
  description?: string;
  kind?: ActionKind;
  implementation?: Record<string, unknown>;
  requires?: JSONSchemaProperty;
  produces?: JSONSchemaProperty;
  execution?: ActionExecution;
  idempotency?: ActionIdempotency;
  _loc?: SourceLocation;
}

// =============================================================================
// Union type for any document
// =============================================================================

export type AnyDocument = WflowDocument | TaskDocument | ActionDocument;

/**
 * Detected file type from extension
 */
export type FileType = 'wflow' | 'task' | 'action' | 'wtest' | 'unknown';
