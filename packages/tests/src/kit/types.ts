/**
 * Kit Types
 *
 * All type definitions for the test kit.
 */

import type { EventEntry, TraceEventEntry } from '@wonder/sdk';
import type { TraceEventCollection } from './trace';

// =============================================================================
// Context Types
// =============================================================================

export interface TestContext {
  workspaceId: string;
  projectId: string;
  modelProfileId: string;
}

// =============================================================================
// Resource Types
// =============================================================================

/**
 * Tracks IDs of created resources for cleanup
 */
export interface CreatedResources {
  promptSpecIds: string[];
  actionIds: string[];
  taskIds: string[];
}

// =============================================================================
// Cleanup Types
// =============================================================================

export interface Deletable {
  delete: () => Promise<unknown>;
}

// =============================================================================
// Workflow Types
// =============================================================================

export interface WorkflowTestSetup extends TestContext {
  workflowDefId: string;
  workflowId: string;
  /** IDs of all created resources for cleanup (in creation order) */
  createdResources: CreatedResources;
}

/**
 * Result from executing a workflow
 */
export interface ExecuteWorkflowResult {
  workflowRunId: string;
  status: 'completed' | 'failed' | 'timeout' | 'idle_timeout';
  events: EventEntry[];
  traceEvents: TraceEventEntry[];
  trace: TraceEventCollection;
}

/**
 * Result from runTestWorkflow
 */
export interface TestWorkflowResult {
  /** Results from executing the workflow */
  result: ExecuteWorkflowResult;
  /** The setup object with IDs of created resources */
  setup: WorkflowTestSetup;
  /** Cleanup function - call this when done */
  cleanup: () => Promise<void>;
}
