/**
 * Planning Module
 *
 * Pure decision logic for workflow execution.
 * All functions are side-effect free and return { decisions, events } tuples.
 *
 * The planning layer implements the "think" phase of the coordinator:
 * - Evaluate conditions
 * - Determine routing
 * - Check synchronization
 * - Generate decisions as pure data
 * - Collect trace events for observability
 *
 * The dispatch layer then executes decisions and emits events.
 */

// Routing: transition evaluation and token creation decisions
export {
  buildPathId,
  decideRouting,
  evaluateCondition,
  getMergeConfig as getRoutingMergeConfig,
  getTransitionsWithSynchronization,
  toTransitionDef,
  type PlanningResult,
} from './routing';

// Synchronization: fan-in and merge decisions
export {
  decideOnSiblingCompletion,
  decideOnTimeout,
  decideSynchronization,
  getMergeConfig as getSyncMergeConfig,
  hasTimedOut,
  needsMerge,
} from './synchronization';

// Completion: workflow finalization and output extraction
export {
  applyInputMapping,
  extractFinalOutput,
  extractValueFromContext,
  type CompletionResult,
} from './completion';
