/**
 * Merge Strategy Functions
 *
 * Pure functions for merging branch outputs during fan-in operations.
 * These are extracted to enable unit testing without D1 dependencies.
 */

import type { BranchOutput, MergeStrategy } from '../types';

/**
 * Apply merge strategy to collect branch outputs into a single value.
 *
 * Strategies:
 * - append: Collect all outputs into array, ordered by branch index
 * - collect: Same as append but never flattens arrays
 * - merge_object: Shallow merge all outputs (last wins for conflicts)
 * - keyed_by_branch: Object keyed by branch index
 * - last_wins: Take output from highest branch index
 */
export function applyMergeStrategy(
  branchOutputs: BranchOutput[],
  strategy: MergeStrategy,
): unknown {
  // Sort by branch index for consistent ordering
  const sorted = [...branchOutputs].sort((a, b) => a.branchIndex - b.branchIndex);

  switch (strategy) {
    case 'append':
      // Collect all outputs into array, ordered by branch index
      // Note: context.ts flattens arrays for 'append' - this is the pure version
      return sorted.map((b) => b.output);

    case 'collect':
      // Same as append - collect all outputs preserving structure
      // Exists for semantic clarity: 'collect' never flattens, 'append' may flatten
      return sorted.map((b) => b.output);

    case 'merge_object':
      // Shallow merge all outputs (last wins for conflicts)
      return Object.assign({}, ...sorted.map((b) => b.output));

    case 'keyed_by_branch':
      // Object keyed by branch index
      return Object.fromEntries(sorted.map((b) => [b.branchIndex.toString(), b.output]));

    case 'last_wins':
      // Take last completed (highest branch index)
      if (branchOutputs.length === 0) {
        return {};
      }
      const lastBranch = sorted[sorted.length - 1];
      return lastBranch?.output ?? {};

    default:
      throw new Error(`Unknown merge strategy: ${strategy}`);
  }
}
