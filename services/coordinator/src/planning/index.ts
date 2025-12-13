/**
 * Planning Module
 *
 * Pure decision logic for workflow execution.
 * All functions are side-effect free and return Decision[] arrays.
 *
 * The planning layer implements the "think" phase of the coordinator:
 * - Evaluate conditions
 * - Determine routing
 * - Check synchronization
 * - Generate decisions as pure data
 *
 * The dispatch layer then executes these decisions.
 */

// Routing: transition evaluation and token creation decisions
export {
  buildPathId,
  decideRouting,
  evaluateCondition,
  getMergeConfig as getRoutingMergeConfig,
  getTransitionsWithSynchronization,
} from './routing.js';

// Synchronization: fan-in and merge decisions
export {
  decideMerge,
  decideOnSiblingCompletion,
  decideOnTimeout,
  decideSynchronization,
  getMergeConfig as getSyncMergeConfig,
  hasTimedOut,
  needsMerge,
} from './synchronization.js';
