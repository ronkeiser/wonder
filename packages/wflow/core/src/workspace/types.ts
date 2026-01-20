import type { AnyDocument, Diagnostic } from '../types/index.js';

/**
 * Reference scopes for definition references
 *
 * - workspace: Unqualified name, resolves within the workspace (personas/, agents/)
 * - standardLibrary: library/name format, resolves against platform-provided libraries
 * - workspaceLibrary: $library/name format, resolves against workspace libraries/
 * - project: @project/name format, resolves against workspace projects/
 */
export type ReferenceScope = 'workspace' | 'standardLibrary' | 'workspaceLibrary' | 'project';

/**
 * Parsed reference structure
 *
 * Examples:
 * - { scope: 'workspace', name: 'code-assistant' } from "code-assistant"
 * - { scope: 'standardLibrary', library: 'core', name: 'shell-exec' } from "core/shell-exec"
 * - { scope: 'workspaceLibrary', library: 'mylib', name: 'utils' } from "$mylib/utils"
 * - { scope: 'project', project: 'backend', name: 'deploy' } from "@backend/deploy"
 */
export type Reference =
  | { scope: 'workspace'; name: string }
  | { scope: 'standardLibrary'; library: string; name: string }
  | { scope: 'workspaceLibrary'; library: string; name: string }
  | { scope: 'project'; project: string; name: string };

/**
 * Definition types that can exist in a workspace
 */
export type DefinitionType = 'workflow' | 'task' | 'action' | 'tool' | 'persona' | 'agent';

/**
 * A parsed definition within the workspace
 */
export interface WorkspaceDefinition {
  /** Structured reference for this definition */
  reference: Reference;
  /** Absolute file path */
  filePath: string;
  /** Definition type derived from file extension */
  definitionType: DefinitionType;
  /** Parsed AST document */
  document: AnyDocument;
  /** SHA-256 content hash for idempotency */
  contentHash: string;
  /** References this definition depends on */
  dependencies: Reference[];
}

/**
 * Workspace configuration from wflow.config.yaml
 */
export interface WorkspaceConfig {
  /** Default workspace ID for deployment */
  workspaceId?: string;
  /** Glob patterns to exclude from loading */
  exclude?: string[];
}

/**
 * Loaded workspace with all definitions
 */
export interface Workspace {
  /** Absolute path to workspace root */
  root: string;
  /** Definitions keyed by formatted reference string */
  definitions: Map<string, WorkspaceDefinition>;
  /** Optional configuration from wflow.config.yaml */
  config?: WorkspaceConfig;
}

/**
 * Standard library manifest for reference validation
 *
 * Retrieved from GET /standard-library/manifest
 */
export interface StandardLibraryManifest {
  /** Libraries with their definitions: library name -> definition name -> type */
  libraries: Record<string, Record<string, DefinitionType>>;
}

/**
 * Result of workspace validation
 */
export interface WorkspaceValidationResult {
  /** Overall validity - false if any errors exist */
  valid: boolean;
  /** Diagnostics organized by file path */
  diagnosticsByFile: Map<string, Diagnostic[]>;
  /** All diagnostics flattened */
  allDiagnostics: Diagnostic[];
  /** Dependency graph: formatted reference -> references it depends on */
  dependencyGraph: Map<string, Reference[]>;
  /** Detected dependency cycles (if any) */
  cycles: Reference[][];
}

/**
 * Deploy status for a single definition
 */
export type DeployStatus =
  | { status: 'unchanged'; serverId: string }
  | { status: 'created'; serverId: string }
  | { status: 'updated'; serverId: string }
  | { status: 'conflict'; localHash: string; serverHash: string }
  | { status: 'error'; message: string };

/**
 * Result of deploy operation
 */
export interface DeployResult {
  /** Results keyed by formatted reference string */
  results: Map<string, DeployStatus>;
  /** Whether all operations succeeded (no conflicts or errors) */
  success: boolean;
}

/**
 * Diff entry comparing local and server state
 */
export interface DiffEntry {
  /** The reference being compared */
  reference: Reference;
  /** Local file path (if exists locally) */
  filePath?: string;
  /** Comparison status */
  status: 'local-only' | 'server-only' | 'modified' | 'unchanged';
  /** Local content hash (if exists locally) */
  localHash?: string;
  /** Server content hash (if exists on server) */
  serverHash?: string;
}

/**
 * Result of diff operation
 */
export interface DiffResult {
  /** All diff entries */
  entries: DiffEntry[];
  /** Count of local-only definitions */
  localOnlyCount: number;
  /** Count of server-only definitions */
  serverOnlyCount: number;
  /** Count of modified definitions */
  modifiedCount: number;
  /** Count of unchanged definitions */
  unchangedCount: number;
}
