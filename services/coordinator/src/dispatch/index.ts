/**
 * Dispatch Module
 *
 * Executes Decision[] produced by the planning layer.
 * Converts pure decision data into actual state changes.
 *
 * The dispatch layer implements the "act" phase of the coordinator:
 * - Apply decisions to managers (tokens, context)
 * - Batch operations for efficiency
 * - Emit trace events
 */

// Apply: execute decisions using managers
export {
  applyDecisions,
  applyTracedDecisions,
  type ApplyResult,
  type DispatchContext,
} from './apply.js';

// Batch: optimize decision lists
export {
  batchDecisions,
  countBatchedDecisions,
  extractAffectedTokenIds,
  groupByType,
  isBatchable,
} from './batch.js';
