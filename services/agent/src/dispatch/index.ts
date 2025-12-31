/**
 * Agent Dispatch Layer
 *
 * Applies decisions from planning modules by routing to operations managers
 * and external services.
 */

export { applyDecisions, type ApplyResult } from './apply';
export { type DispatchContext } from './context';
