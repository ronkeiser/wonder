/**
 * Type definitions for schema JSON columns.
 * These types are used by the drizzle schema for proper type inference.
 */

import type { Expression } from '@wonder/expressions';

// ============================================================================
// Transition Field Types
// ============================================================================

/**
 * Condition expression for transition guards.
 * Uses the expression language from @wonder/expressions.
 */
export type Condition = Expression;

/**
 * Foreach configuration for dynamic iteration.
 * Creates tokens for each item in a collection.
 */
export type ForeachConfig = {
  collection: string; // Path to array in context (e.g., 'input.judges')
  itemVar: string; // Variable name for each item
};

/**
 * Loop configuration for cycle control.
 * Prevents infinite loops by limiting iterations.
 */
export type LoopConfig = {
  maxIterations: number; // Maximum times this transition can fire per token lineage
};

/**
 * Merge configuration for combining branch outputs at fan-in.
 */
export type MergeConfig = {
  source: string; // Path in branch output (e.g., '_branch.output', '_branch.output.choice')
  target: string; // Where to write merged result (e.g., 'state.votes')
  strategy: 'append' | 'collect' | 'merge_object' | 'keyed_by_branch' | 'last_wins';
};

/**
 * Synchronization configuration for fan-in.
 * Controls how parallel branches converge.
 */
export type SynchronizationConfig = {
  strategy: 'any' | 'all' | { mOfN: number };
  siblingGroup: string; // Named sibling group identifier
  timeoutMs?: number; // Max wait time (undefined = no timeout)
  onTimeout?: 'proceed_with_available' | 'fail';
  merge?: MergeConfig;
};