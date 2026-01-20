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
  taskId?: string;
  taskVersion?: number;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  resourceBindings?: Record<string, string>;
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
  itemVar: string;
}

export interface MergeConfig {
  source: string;
  target: string;
  strategy: 'append' | 'merge_object' | 'keyed_by_branch' | 'last_wins';
}

export interface SyncConfig {
  strategy: 'all' | 'any' | { mOfN: number };
  siblingGroup: string;
  timeoutMs?: number;
  onTimeout?: 'proceed_with_available' | 'fail';
  merge?: MergeConfig;
}

export interface LoopConfig {
  maxIterations?: number;
  timeoutMs?: number;
}

export interface TransitionDecl {
  fromNodeRef?: string;
  toNodeRef?: string | null;
  priority?: number;
  condition?: ConditionDecl;
  spawnCount?: number;
  foreach?: ForeachConfig;
  synchronization?: SyncConfig;
  loopConfig?: LoopConfig;
  _loc?: SourceLocation;
}

export interface ResourceDecl {
  type: 'container';
  image: string;
  repoId: string;
  baseBranch: string;
  mergeOnSuccess: boolean;
  mergeStrategy: 'rebase' | 'fail' | 'force';
}

export interface WflowDocument {
  imports?: Record<string, string>;
  workflow?: string;
  version?: number;
  description?: string;
  inputSchema?: JSONSchemaProperty;
  contextSchema?: JSONSchemaProperty;
  outputSchema?: JSONSchemaProperty;
  outputMapping?: Record<string, string>;
  resources?: Record<string, ResourceDecl>;
  nodes?: Record<string, NodeDecl>;
  transitions?: Record<string, TransitionDecl>;
  initialNodeRef?: string;
  timeoutMs?: number;
  onTimeout?: 'human_gate' | 'fail' | 'cancel_all';
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
  actionId?: string;
  actionVersion?: number;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  onFailure?: 'abort' | 'retry' | 'continue';
  condition?: StepCondition;
  _loc?: SourceLocation;
}

export interface RetryConfig {
  maxAttempts: number;
  backoff: 'none' | 'linear' | 'exponential';
  initialDelayMs: number;
  maxDelayMs?: number;
}

export interface TaskDocument {
  imports?: Record<string, string>;
  task?: string;
  version?: number;
  name?: string;
  description?: string;
  tags?: string[];
  inputSchema?: JSONSchemaProperty;
  outputSchema?: JSONSchemaProperty;
  steps?: StepDecl[];
  retry?: RetryConfig;
  timeoutMs?: number;
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
  | 'context'
  | 'vector'
  | 'metric'
  | 'human';

export interface ActionRetryPolicy {
  maxAttempts: number;
  backoff: 'none' | 'linear' | 'exponential';
  initialDelayMs: number;
  maxDelayMs?: number;
  retryableErrors?: string[];
}

export interface ActionExecution {
  timeoutMs?: number;
  retryPolicy?: ActionRetryPolicy;
}

export interface ActionIdempotency {
  keyTemplate: string;
  ttlSeconds?: number;
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
// Test Types
// =============================================================================

/**
 * Assertion primitives for test validation
 */
export type AssertionPrimitive =
  | 'eq'
  | 'not_eq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'matches'
  | 'starts_with'
  | 'ends_with'
  | 'length'
  | 'min_length'
  | 'max_length'
  | 'type'
  | 'exists'
  | 'not_empty'
  | 'has_keys'
  | 'every'
  | 'some'
  | 'not';

/**
 * Single assertion declaration
 * Can be a primitive value (implicit eq) or an object with assertion type
 */
export type AssertionValue = string | number | boolean | null | AssertionObject | AssertionValue[];

export interface AssertionObject {
  eq?: unknown;
  not_eq?: unknown;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  contains?: string | unknown;
  not_contains?: string | unknown;
  matches?: string;
  starts_with?: string;
  ends_with?: string;
  length?: number;
  min_length?: number;
  max_length?: number;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  exists?: boolean;
  not_empty?: boolean;
  has_keys?: string[];
  every?: AssertionValue;
  some?: AssertionValue;
  not?: AssertionValue;
}

/**
 * Assertions map - path to assertion value
 */
export type AssertionsDecl = Record<string, AssertionValue>;

/**
 * Mock response configuration
 */
export interface MockResponseDecl {
  /** Static response data */
  returns?: unknown;
  /** Sequence of responses for multiple calls */
  sequence?: unknown[];
  /** Conditional responses based on input */
  when?: Array<{
    input: Record<string, unknown>;
    returns: unknown;
  }>;
  /** Simulate failure */
  throws?: {
    type: string;
    message: string;
  };
  /** Delay before responding (ms) */
  delayMs?: number;
}

/**
 * Mock declaration for an action
 */
export interface MockDecl {
  /** The action being mocked (import alias) */
  action?: string;
  /** Mock response configuration */
  response?: MockResponseDecl;
  /** Track call count and arguments */
  trackCalls?: boolean;
  _loc?: SourceLocation;
}

/**
 * Fixture declaration - reusable test data
 */
export interface FixtureDecl {
  [key: string]: unknown;
}

/**
 * Single test case
 */
export interface TestCaseDecl {
  /** Human-readable description */
  description?: string;
  /** Import alias of workflow/task/action to test */
  target: string;
  /** Input data for the target */
  input?: Record<string, unknown>;
  /** Initial context state (workflows only) */
  context?: Record<string, unknown>;
  /** Test-specific mock overrides */
  mocks?: Record<string, MockDecl | MockResponseDecl>;
  /** Maximum execution time (snake_case alias: timeout_ms) */
  timeoutMs?: number;
  /** Assertions to verify */
  assert?: AssertionsDecl;
  /** Expected output for snapshot testing */
  snapshot?: boolean | string;
  /** Tags for filtering */
  tags?: string[];
  /** Skip this test */
  skip?: boolean;
  /** Only run this test */
  only?: boolean;
  _loc?: SourceLocation;
}

/**
 * Test group for organizing related tests
 */
export interface TestGroupDecl {
  description?: string;
  tests: string[];
  tags?: string[];
  _loc?: SourceLocation;
}

/**
 * Lifecycle hooks
 */
export interface TestHooksDecl {
  beforeAll?: Array<{
    action: string;
    input?: Record<string, unknown>;
  }>;
  afterAll?: Array<{
    action: string;
    input?: Record<string, unknown>;
  }>;
  beforeEach?: Array<{
    action: string;
    input?: Record<string, unknown>;
  }>;
  afterEach?: Array<{
    action: string;
    input?: Record<string, unknown>;
  }>;
}

/**
 * Test configuration
 */
export interface TestConfigDecl {
  parallel?: boolean;
  maxConcurrent?: number;
  timeoutMs?: number;
  failFast?: boolean;
}

/**
 * Coverage configuration
 */
export interface TestCoverageDecl {
  targets?: string[];
  thresholds?: {
    nodes?: number;
    branches?: number;
    actions?: number;
  };
}

/**
 * Test document (.test file)
 */
export interface TestDocument {
  imports?: Record<string, string>;
  testSuite?: string;
  description?: string;
  /** Mock definitions for actions */
  mocks?: Record<string, MockDecl | MockResponseDecl>;
  /** Reusable test data */
  fixtures?: Record<string, FixtureDecl>;
  /** Test case definitions */
  tests?: Record<string, TestCaseDecl>;
  /** Test groups */
  groups?: Record<string, TestGroupDecl>;
  /** Lifecycle hooks */
  hooks?: TestHooksDecl;
  /** Run configuration */
  config?: TestConfigDecl;
  /** Coverage configuration */
  coverage?: TestCoverageDecl;
  _loc?: SourceLocation;
}

// =============================================================================
// Persona Types
// =============================================================================

/**
 * Persona constraints configuration
 */
export interface PersonaConstraints {
  maxMovesPerTurn?: number;
}

/**
 * Persona document (.persona file)
 */
export interface PersonaDocument {
  imports?: Record<string, string>;
  persona?: string;
  description?: string;
  systemPrompt?: string;
  modelProfileId?: string;
  contextAssemblyWorkflowId?: string;
  memoryExtractionWorkflowId?: string;
  recentTurnsLimit?: number;
  toolIds?: string[];
  constraints?: PersonaConstraints;
  _loc?: SourceLocation;
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Tool retry configuration
 */
export interface ToolRetryConfig {
  maxAttempts?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

/**
 * Tool document (.tool file)
 */
export interface ToolDocument {
  imports?: Record<string, string>;
  tool?: string;
  description?: string;
  inputSchema?: JSONSchemaProperty;
  targetType?: 'task' | 'workflow' | 'agent';
  targetId?: string;
  async?: boolean;
  invocationMode?: 'delegate' | 'loop_in';
  inputMapping?: Record<string, string>;
  retry?: ToolRetryConfig;
  _loc?: SourceLocation;
}

// =============================================================================
// Run Types
// =============================================================================

/**
 * Environment-specific overrides
 */
export interface EnvironmentOverrideDecl {
  input?: Record<string, unknown>;
  resourceBindings?: Record<string, string>;
  timeoutMs?: number;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Run document (.run file)
 */
export interface RunDocument {
  imports?: Record<string, string>;
  run?: string;
  description?: string;
  /** Path to workflow */
  workflow?: string;
  /** Project ID this run belongs to */
  projectId?: string;
  /** Execution environment */
  environment?: 'development' | 'staging' | 'production';
  /** Input data */
  input?: Record<string, unknown>;
  /** Path to input file */
  inputFile?: string;
  /** Initial context state */
  context?: Record<string, unknown>;
  /** Override resource bindings */
  resourceBindings?: Record<string, string>;
  /** Override timeout */
  timeoutMs?: number;
  /** Execution priority */
  priority?: 'low' | 'normal' | 'high';
  /** Idempotency key */
  idempotencyKey?: string;
  /** Tags for filtering */
  tags?: string[];
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** Environment-specific overrides */
  environments?: Record<string, EnvironmentOverrideDecl>;
  _loc?: SourceLocation;
}

// =============================================================================
// Union type for any document
// =============================================================================

export type AnyDocument =
  | WflowDocument
  | TaskDocument
  | ActionDocument
  | TestDocument
  | RunDocument
  | PersonaDocument
  | ToolDocument;

/**
 * Detected file type from extension
 */
export type FileType = 'wflow' | 'task' | 'action' | 'test' | 'run' | 'persona' | 'tool' | 'unknown';
