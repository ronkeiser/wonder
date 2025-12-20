/**
 * Verification API Types
 *
 * Types for declarative workflow execution verification.
 */

import type { EmbeddedWorkflowDef, TraceEventCollection } from '@wonder/sdk';

/**
 * Token creation payload type (mirrors SDK's TracePayloads.TokenCreatedPayload)
 */
export interface TokenCreatedPayload {
  taskId: string;
  parentTokenId: string | null;
  pathId: string;
  siblingGroup: string | null;
  branchIndex: number;
  branchTotal: number;
}

/**
 * Typed trace event (mirrors SDK's TypedTraceEvent)
 */
export interface TypedTraceEvent<TPayload = Record<string, unknown>> {
  type: string;
  tokenId: string | null;
  nodeId: string | null;
  durationMs: number | null;
  sequence: number;
  timestamp: number;
  category: string;
  payload: TPayload;
}

// =============================================================================
// Core Types
// =============================================================================

/**
 * Fan-out group specification.
 * Describes expected tokens from a single fan-out transition.
 */
export interface FanOutSpec {
  /** Number of sibling tokens in this fan-out group */
  count: number;

  /** Expected branchTotal on each sibling (should equal count) */
  branchTotal: number;

  /** Expected output fields from this fan-out's branches (optional) */
  outputFields?: string[];
}

/**
 * Token structure specification for verification.
 * Describes expected token creation patterns.
 */
export interface TokenStructure {
  /** Expected number of root tokens (usually 1) */
  root: number;

  /**
   * Fan-out groups - each entry represents one fan-out transition.
   * For sequential fan-out/fan-in, provide multiple entries.
   */
  fanOuts?: FanOutSpec[];

  /** Expected fan-in arrival tokens (created when siblings arrive at sync) */
  fanInArrivals?: number;

  /** Expected fan-in continuation tokens (created after sync completes) */
  fanInContinuations?: number;

  /** Total expected token count (optional - computed if not specified) */
  total?: number;
}

/**
 * State write specification for verification.
 */
export interface StateWriteSpec {
  /** Path to the state field (e.g., 'state.seed') */
  path: string;

  /** Expected value type */
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';

  /** Expected value (exact match) */
  value?: unknown;

  /** Value matcher function */
  matcher?: (value: unknown) => boolean;

  /** If array type, expected length */
  arrayLength?: number;

  /** Optional description for error messages */
  description?: string;
}

/**
 * Output field specification for verification.
 */
export interface OutputFieldSpec {
  /** Expected value type */
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'undefined';

  /** Expected value (exact match) */
  value?: unknown;

  /** Value matcher function */
  matcher?: (value: unknown) => boolean;

  /** If array type, expected length */
  arrayLength?: number;

  /** If set, the value must be defined (not undefined/null) */
  defined?: boolean;
}

/**
 * Output specification - can be full spec or simple value/matcher
 */
export type OutputSpec = Record<string, OutputFieldSpec | unknown>;

/**
 * Branch write specification for verification.
 * Note: Per-fan-out outputFields validation is handled in FanOutSpec.
 */
export interface BranchWriteSpec {
  /** Expected number of unique tokens with branch writes */
  uniqueTokenCount?: number;

  /** Matcher for branch output values */
  outputMatcher?: (output: Record<string, unknown>, tokenId: string) => boolean;
}

/**
 * Context snapshot specification for verification.
 */
export interface SnapshotSpec {
  /** Minimum number of snapshots expected */
  minCount?: number;

  /** Check for a snapshot with specific state */
  withState?: {
    field: string;
    matcher: (value: unknown) => boolean;
  };
}

/**
 * Full verification configuration.
 */
export interface VerificationConfig {
  /** Verify workflow completed successfully */
  completed?: boolean;

  /** Token structure verification */
  tokens?: TokenStructure;

  /** State write order verification */
  stateWriteOrder?: string[];

  /** Individual state write verifications */
  stateWrites?: StateWriteSpec[];

  /** Output verification */
  output?: OutputSpec;

  /** Branch write verification */
  branchWrites?: BranchWriteSpec;

  /** Context snapshot verification */
  snapshots?: SnapshotSpec;

  /** Custom verifications */
  custom?: Array<{
    name: string;
    verify: (trace: TraceEventCollection, ctx: VerificationContext) => void;
  }>;
}

/**
 * Fan-out group with its sibling tokens.
 */
export interface FanOutGroup {
  /** The siblingGroup identifier for this group */
  siblingGroup: string;
  /** Sibling tokens in this group */
  siblings: TypedTraceEvent<TokenCreatedPayload>[];
}

/**
 * Context passed to verification methods.
 */
export interface VerificationContext {
  /** The trace event collection */
  trace: TraceEventCollection;

  /** The workflow input */
  input: unknown;

  /** The workflow definition */
  definition: EmbeddedWorkflowDef;

  /** Collected data during verification */
  collected: {
    rootTokens: TypedTraceEvent<TokenCreatedPayload>[];
    /** All fan-out siblings (flat list for backward compat) */
    fanOutSiblings: TypedTraceEvent<TokenCreatedPayload>[];
    /** Fan-out groups organized by siblingGroup */
    fanOutGroups: FanOutGroup[];
    fanInArrivals: TypedTraceEvent<TokenCreatedPayload>[];
    fanInContinuations: TypedTraceEvent<TokenCreatedPayload>[];
    branchOutputs: Map<string, Record<string, unknown>>;
    stateWrites: Map<string, { value: unknown; sequence: number }>;
    finalOutput: Record<string, unknown> | null;
  };
}

/**
 * Workflow failure information extracted from events.
 */
export interface WorkflowFailure {
  /** Error message from the failure */
  message: string;

  /** Token ID where failure occurred (if task failure) */
  tokenId?: string;

  /** Node ID where failure occurred (if task failure) */
  nodeId?: string;

  /** Task ID that failed (if task failure) */
  taskId?: string;

  /** Error details from metadata */
  error?: {
    type?: string;
    message: string;
    retryable?: boolean;
  };

  /** Execution metrics at time of failure */
  metrics?: {
    durationMs?: number;
    stepsExecuted?: number;
  };
}

/**
 * Diagnostic context for error reporting.
 */
export interface DiagnosticContext {
  /** Workflow input */
  input: unknown;

  /** All token creations */
  tokenCreations: Array<{
    tokenId: string | null;
    pathId: string;
    parentId: string | null;
    siblingGroup: string | null;
    branchIndex: number;
    branchTotal: number;
  }>;

  /** Token structure summary */
  tokenSummary: {
    root: number;
    siblings: number;
    fanInArrivals: number;
    fanInContinuations: number;
    other: number;
    total: number;
  };

  /** All state writes with sequence */
  stateWrites: Array<{
    path: string;
    value: unknown;
    sequence: number;
  }>;

  /** Branch writes */
  branchWrites: Array<{
    tokenId: string | null;
    output: unknown;
  }>;

  /** Final output from completion event */
  finalOutput: unknown;

  /** Context snapshots */
  snapshots: Array<{
    sequence: number;
    input: unknown;
    state: unknown;
    output: unknown;
  }>;

  /** Error events if any */
  errors: Array<{
    type: string;
    payload: unknown;
  }>;

  /** Workflow failure info (if workflow failed) */
  failure?: WorkflowFailure;
}

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether all verifications passed */
  success: boolean;

  /** Errors if verification failed */
  errors: string[];

  /** Diagnostic context (always populated for debugging) */
  diagnostics: DiagnosticContext;

  /** Collected verification context */
  context: VerificationContext;
}
