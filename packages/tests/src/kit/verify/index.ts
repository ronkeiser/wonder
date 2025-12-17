/**
 * Workflow Verification API
 *
 * Declarative, self-diagnosing workflow test verifications.
 * Eliminates bolt-on diagnostics by providing comprehensive
 * error context automatically on any failure.
 *
 * @example
 * import { verify } from '~/kit/verify';
 *
 * verify(trace, { input, definition })
 *   .completed()
 *   .withTokens({ root: 1, siblings: { count: 3, sharedFanOutId: true } })
 *   .withStateWriteOrder(['state.seed', 'state.results', 'state.summary'])
 *   .withOutput({
 *     prefix: 'TEST',
 *     merged_results: { type: 'array', arrayLength: 3 },
 *   })
 *   .run();
 */

// Re-export everything
export { WorkflowVerificationError } from './error.js';
export type {
  BranchWriteSpec,
  DiagnosticContext,
  OutputFieldSpec,
  OutputSpec,
  SnapshotSpec,
  StateWriteSpec,
  TokenStructure,
  VerificationConfig,
  VerificationContext,
  VerificationResult,
} from './types.js';
export { verify, WorkflowVerifier } from './verifier.js';
