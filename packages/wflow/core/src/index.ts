/**
 * @wonder/wflow - Core parsing and analysis for .wflow workflow definitions
 *
 * This package provides:
 * - YAML parsing for .wflow, .task, and .action files
 * - Graph analysis (cycles, reachability, topological sort)
 * - Data flow analysis (tracking reads/writes across nodes)
 * - Schema validation utilities
 *
 * @example
 * ```typescript
 * import { parseWorkflow, buildGraph, analyzeDataFlow, extractPaths } from '@wonder/wflow';
 *
 * const result = parseWorkflow(yamlText, 'workflow.wflow');
 * if (result.document) {
 *   const graph = buildGraph(result.document);
 *   const inputPaths = extractPaths(result.document.input_schema, 'input');
 *   const dataFlow = analyzeDataFlow(result.document, graph, inputPaths);
 * }
 * ```
 */

// Types
export type {
  ActionDocument,
  ActionExecution,
  ActionIdempotency,
  ActionKind,
  ActionRetryPolicy,
  AnyDocument,
  ConditionDecl,
  Diagnostic,
  DiagnosticRelatedInformation,
  // Diagnostic types
  DiagnosticSeverity,
  FileType,
  ForeachConfig,
  // AST types
  JSONSchemaProperty,
  LoopConfig,
  MergeConfig,
  NodeDecl,
  Position,
  Range,
  ResourceDecl,
  RetryConfig,
  SourceLocation,
  StepCondition,
  StepDecl,
  SyncConfig,
  TaskDocument,
  TransitionDecl,
  ValidationResult,
  WflowDocument,
} from './types/index.js';

// Parser
export {
  escapeRegex,
  getFileType,
  parseAction,
  parseDocument,
  parseImports,
  parseTask,
  parseWorkflow,
  type ImportsMap,
  type ParseResult,
  type ResolvedImport,
} from './parser/index.js';

// Analyzer - Graph
export {
  buildGraph,
  buildTransitionMap,
  detectCycles,
  findReachableNodes,
  findUnreachableNodes,
  topologicalSort,
  type GraphAnalysis,
} from './analyzer/graph.js';

// Analyzer - Schema
export {
  ACTION_ALLOWED_PROPS,
  ACTION_EXECUTION_ALLOWED_PROPS,
  ACTION_IDEMPOTENCY_ALLOWED_PROPS,
  ACTION_RETRY_POLICY_ALLOWED_PROPS,
  CONDITION_ALLOWED_PROPS,
  FOREACH_ALLOWED_PROPS,
  IMPLEMENTATION_PROPS_BY_KIND,
  JSON_SCHEMA_ALLOWED_PROPS,
  MERGE_ALLOWED_PROPS,
  NODE_ALLOWED_PROPS,
  RESOURCE_ALLOWED_PROPS,
  RETRY_ALLOWED_PROPS,
  STEP_ALLOWED_PROPS,
  STEP_CONDITION_ALLOWED_PROPS,
  SYNCHRONIZATION_ALLOWED_PROPS,
  TASK_ALLOWED_PROPS,
  TRANSITION_ALLOWED_PROPS,
  VALID_ACTION_KINDS,
  // Allowed property sets
  WORKFLOW_ALLOWED_PROPS,
  // Functions
  extractPaths,
  findSimilarPaths,
  findUnknownProps,
  getSchemaPropertyAtPath,
} from './analyzer/schema.js';

// Analyzer - Data Flow
export {
  analyzeDataFlow,
  getPathWriters,
  isPathAvailable,
  runDataFlowAnalysis,
  type DataFlowAnalysis,
  type PathWriter,
} from './analyzer/dataflow.js';
