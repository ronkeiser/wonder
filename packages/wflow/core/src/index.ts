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
 *   const inputPaths = extractPaths(result.document.inputSchema, 'input');
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
  // Test types
  AssertionObject,
  AssertionPrimitive,
  AssertionValue,
  AssertionsDecl,
  ConditionDecl,
  Diagnostic,
  DiagnosticRelatedInformation,
  // Run types
  EnvironmentOverrideDecl,
  FileType,
  FixtureDecl,
  ForeachConfig,
  // AST types
  JSONSchemaProperty,
  LoopConfig,
  MergeConfig,
  MockDecl,
  MockResponseDecl,
  NodeDecl,
  // Persona types
  PersonaConstraints,
  PersonaDocument,
  Position,
  Range,
  ResourceDecl,
  RetryConfig,
  RunDocument,
  SourceLocation,
  StepCondition,
  StepDecl,
  SyncConfig,
  TaskDocument,
  TestCaseDecl,
  TestConfigDecl,
  TestCoverageDecl,
  TestDocument,
  TestGroupDecl,
  TestHooksDecl,
  // Tool types
  ToolDocument,
  ToolRetryConfig,
  TransitionDecl,
  ValidationResult,
  WflowDocument,
} from './types/index.js';

// DiagnosticSeverity is an enum, needs value export
export { DiagnosticSeverity } from './types/index.js';

// Parser
export {
  escapeRegex,
  getFileType,
  parseAction,
  parseDocument,
  parseImports,
  parsePersona,
  parseRun,
  parseTask,
  parseTest,
  parseTool,
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
  PERSONA_ALLOWED_PROPS,
  PERSONA_CONSTRAINTS_ALLOWED_PROPS,
  RESOURCE_ALLOWED_PROPS,
  RETRY_ALLOWED_PROPS,
  STEP_ALLOWED_PROPS,
  STEP_CONDITION_ALLOWED_PROPS,
  SYNCHRONIZATION_ALLOWED_PROPS,
  TASK_ALLOWED_PROPS,
  TOOL_ALLOWED_PROPS,
  TOOL_RETRY_ALLOWED_PROPS,
  TRANSITION_ALLOWED_PROPS,
  VALID_ACTION_KINDS,
  VALID_TOOL_INVOCATION_MODES,
  VALID_TOOL_TARGET_TYPES,
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

// Analyzer - Test
export {
  ASSERTION_PRIMITIVES,
  MOCK_DECL_ALLOWED_PROPS,
  MOCK_RESPONSE_ALLOWED_PROPS,
  TEST_CASE_ALLOWED_PROPS,
  TEST_CONFIG_ALLOWED_PROPS,
  TEST_COVERAGE_ALLOWED_PROPS,
  TEST_DOCUMENT_ALLOWED_PROPS,
  TEST_HOOKS_ALLOWED_PROPS,
  analyzeTestDocument,
  getTestsToRun,
  validateTestDocument,
  type TestAnalysis,
} from './analyzer/test.js';

// Analyzer - Persona
export { validatePersonaDocument } from './analyzer/persona.js';

// Analyzer - Tool
export { validateToolDocument } from './analyzer/tool.js';

// Workspace
export {
  // Types
  type DefinitionType,
  type DeployResult,
  type DeployStatus,
  type DiffEntry,
  type DiffResult,
  type Reference,
  type ReferenceScope,
  type StandardLibraryManifest,
  type Workspace,
  type WorkspaceConfig,
  type WorkspaceDefinition,
  type WorkspaceValidationResult,
  // Constants
  STANDARD_LIBRARY_WORKSPACE_NAME,
  // Reference parsing
  formatReference,
  isValidName,
  parseReference,
  referencesEqual,
  tryParseReference,
  // Validation
  canResolveReference,
  DiagnosticCodes,
  validateWorkspace,
  // Ordering
  getDeployOrder,
  groupByType,
} from './workspace/index.js';
