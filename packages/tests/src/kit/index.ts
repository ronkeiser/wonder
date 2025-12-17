/**
 * Test Kit
 *
 * Unified test utilities for workflow testing.
 *
 * @example
 * import { runTestWorkflow, assertInvariants, verify } from '~/kit';
 *
 * const { result, cleanup } = await runTestWorkflow(workflowDef, input);
 * assertInvariants(result.trace);
 * verify(result.trace, { input, definition: workflowDef })
 *   .completed()
 *   .withTokens({ root: 1, total: 1 })
 *   .run();
 * await cleanup();
 */

// All types from root types.ts
export type {
  CreatedResources,
  Deletable,
  TestContext,
  TestWorkflowResult,
  WorkflowTestSetup,
} from './types.js';

// Context setup and teardown
export { cleanupTestContext, setupTestContext } from './context.js';

// Cleanup utilities
export { cleanup, cleanupWorkflowTest } from './cleanup.js';

// Workflow creation and execution
export { createWorkflow, executeWorkflow, runTestWorkflow } from './workflow.js';

// Invariant assertions
export { assertInvariants } from './invariants.js';

// Verification API
export {
  verify,
  WorkflowVerificationError,
  WorkflowVerifier,
  type BranchWriteSpec,
  type DiagnosticContext,
  type OutputFieldSpec,
  type OutputSpec,
  type SnapshotSpec,
  type StateWriteSpec,
  type TokenStructure,
  type VerificationConfig,
  type VerificationContext,
  type VerificationResult,
} from './verify/index.js';
