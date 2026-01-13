/**
 * Test Kit
 *
 * Unified test utilities for workflow and conversation testing.
 *
 * @example
 * // Workflow testing
 * import { runTestWorkflow, assertInvariants, verify } from '~/kit';
 *
 * const { result, cleanup } = await runTestWorkflow(workflowDef, input);
 * assertInvariants(result.trace);
 * verify(result.trace, { input, definition: workflowDef })
 *   .completed()
 *   .withTokens({ root: 1, total: 1 })
 *   .run();
 * await cleanup();
 *
 * @example
 * // Conversation testing
 * import { runTestConversation, assertConversationInvariants } from '~/kit';
 *
 * const { result, cleanup } = await runTestConversation(
 *   { name: 'Test', contextAssemblyWorkflowId: '...', memoryExtractionWorkflowId: '...' },
 *   [{ role: 'user', content: 'Hello!' }],
 * );
 * assertConversationInvariants(result.trace);
 * await cleanup();
 */

// Trace event utilities (moved from SDK - test-specific)
export { parseTraceEvents, TraceEventCollection } from './trace';
export type { TraceEventEntry, TracePayloads, TypedTraceEvent } from './trace';

// All types from root types.ts
export type {
  CreatedResources,
  Deletable,
  TestContext,
  TestWorkflowResult,
  WorkflowTestSetup,
  // Conversation types
  ConversationTestSetup,
  CreatedConversationResources,
  ExecuteConversationResult,
  TestConversationResult,
} from './types';

// Context setup and teardown
export { cleanupTestContext, setupTestContext } from './context';

// Cleanup utilities
export { cleanup, cleanupWorkflowTest } from './cleanup';

// Workflow creation and execution
export { createWorkflow, executeWorkflow, runTestWorkflow } from './workflow';

// Conversation creation and execution
export {
  cleanupConversationTest,
  executeConversation,
  runTestConversation,
  type TestPersonaConfig,
} from './conversation';

// Conversation trace event collection
export { ConversationTraceEventCollection } from './conversation-trace';
export type { ConversationTracePayloads } from './conversation-trace';

// Conversation invariant assertions
export { assertConversationInvariants } from './conversation-invariants';

// Workflow invariant assertions
export { assertInvariants } from './invariants';

// Constants
export { TIME_JITTER } from './constants';

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
} from './verify/index';
