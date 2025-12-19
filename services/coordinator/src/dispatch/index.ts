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
 * - Handle fan-out/fan-in orchestration
 * - Manage workflow lifecycle
 */

// Re-export types from centralized types.ts
export type { ApplyResult, DispatchContext, TaskErrorResult } from '../types';

// Apply: execute decisions using managers
export { applyDecisions, applyTracedDecisions } from './apply';

// Batch: optimize decision lists
export {
  batchDecisions,
  countBatchedDecisions,
  extractAffectedTokenIds,
  groupByType,
  isBatchable,
} from './batch';

// Fan: fan-out/fan-in orchestration
export { activateFanIn, handleBranchOutput, processSynchronization } from './fan';

// Task: dispatch tokens and process results
export { dispatchToken, processTaskResult } from './task';

// Lifecycle: workflow start, error handling, failure
export { failWorkflow, processTaskError, startWorkflow } from './lifecycle';
