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

// Apply: execute decisions using managers
export {
  applyDecisions,
  applyTracedDecisions,
  type ApplyResult,
  type DispatchContext,
  type ExecutorBinding,
  type ResourcesBinding,
} from './apply';

// Batch: optimize decision lists
export {
  batchDecisions,
  countBatchedDecisions,
  extractAffectedTokenIds,
  groupByType,
  isBatchable,
} from './batch';

// Fan: fan-out/fan-in orchestration
export {
  activateFanIn,
  checkSiblingCompletion,
  handleBranchOutput,
  processSynchronization,
} from './fan';

// Task: dispatch tokens and process results
export { dispatchToken, processTaskResult } from './task';

// Lifecycle: workflow start, error handling, failure
export { failWorkflow, handleTaskError, startWorkflow, type TaskErrorResult } from './lifecycle';
