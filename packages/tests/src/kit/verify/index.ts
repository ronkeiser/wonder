/**
 * Workflow Verification API
 *
 * Declarative, self-diagnosing workflow test verifications.
 * Eliminates bolt-on diagnostics by providing comprehensive
 * error context automatically on any failure.
 *
 * @example
 * import { verify } from '~/kit';
 *
 * verify(trace, { input, definition })
 *   .completed()
 *   .withTokens({
 *     root: 1,
 *     fanOuts: [{ count: 3, branchTotal: 3, outputFields: ['result'] }],
 *   })
 *   .withStateWriteOrder(['state.seed', 'state.results', 'state.summary'])
 *   .withOutput({
 *     prefix: 'TEST',
 *     merged_results: { type: 'array', arrayLength: 3 },
 *   })
 *   .run();
 */

// Re-export everything
export { WorkflowVerificationError } from './error';
export type {
  BranchWriteSpec,
  DiagnosticContext,
  FanOutGroup,
  FanOutSpec,
  OutputFieldSpec,
  OutputSpec,
  SnapshotSpec,
  StateWriteSpec,
  TokenStructure,
  VerificationConfig,
  VerificationContext,
  VerificationResult,
} from './types';
export { verify, WorkflowVerifier } from './verifier';
