/**
 * Kit Types
 *
 * All type definitions for the test kit.
 */

import type { executeWorkflow } from './workflow.js';

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
  taskDefIds: string[];
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
 * Result from runTestWorkflow
 */
export interface TestWorkflowResult {
  /** Results from executing the workflow */
  result: Awaited<ReturnType<typeof executeWorkflow>>;
  /** The setup object with IDs of created resources */
  setup: WorkflowTestSetup;
  /** Cleanup function - call this when done */
  cleanup: () => Promise<void>;
}
