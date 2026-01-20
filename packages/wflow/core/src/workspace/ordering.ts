import { formatReference } from './reference.js';
import type { Workspace, WorkspaceDefinition, WorkspaceValidationResult } from './types.js';

/**
 * Get definitions in topological order for deployment
 *
 * Uses Kahn's algorithm to produce an ordering where dependencies
 * come before the definitions that depend on them.
 *
 * @param workspace - The loaded workspace
 * @param validation - The validation result containing the dependency graph
 * @returns Definitions in deploy order (dependencies first)
 */
export function getDeployOrder(
  workspace: Workspace,
  validation: WorkspaceValidationResult,
): WorkspaceDefinition[] {
  const { dependencyGraph } = validation;

  // Build in-degree map (count of dependencies for each definition)
  const inDegree = new Map<string, number>();
  const allRefs = new Set<string>();

  // Initialize all definitions with 0 in-degree
  for (const refKey of workspace.definitions.keys()) {
    inDegree.set(refKey, 0);
    allRefs.add(refKey);
  }

  // Count incoming edges (dependencies within the workspace)
  for (const [refKey, deps] of dependencyGraph) {
    for (const dep of deps) {
      const depKey = formatReference(dep);
      // Only count dependencies that are in the workspace
      // (standard library deps don't affect deploy order)
      if (workspace.definitions.has(depKey)) {
        inDegree.set(refKey, (inDegree.get(refKey) ?? 0) + 1);
      }
    }
  }

  // Start with definitions that have no dependencies (in-degree 0)
  const queue: string[] = [];
  for (const [refKey, degree] of inDegree) {
    if (degree === 0) {
      queue.push(refKey);
    }
  }

  const result: WorkspaceDefinition[] = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const refKey = queue.shift()!;

    if (processed.has(refKey)) continue;
    processed.add(refKey);

    const def = workspace.definitions.get(refKey);
    if (def) {
      result.push(def);
    }

    // Find definitions that depend on this one and reduce their in-degree
    for (const [otherRefKey, deps] of dependencyGraph) {
      if (processed.has(otherRefKey)) continue;

      const dependsOnCurrent = deps.some((d) => formatReference(d) === refKey);
      if (dependsOnCurrent) {
        const newDegree = (inDegree.get(otherRefKey) ?? 1) - 1;
        inDegree.set(otherRefKey, newDegree);

        if (newDegree === 0) {
          queue.push(otherRefKey);
        }
      }
    }
  }

  // If there are unprocessed definitions, there's a cycle
  // (should already be caught by validation, but handle gracefully)
  for (const refKey of allRefs) {
    if (!processed.has(refKey)) {
      const def = workspace.definitions.get(refKey);
      if (def) {
        result.push(def);
      }
    }
  }

  return result;
}

/**
 * Group definitions by type for organized deployment
 *
 * Returns a map from definition type to definitions of that type,
 * each group in deploy order.
 */
export function groupByType(
  ordered: WorkspaceDefinition[],
): Map<string, WorkspaceDefinition[]> {
  const groups = new Map<string, WorkspaceDefinition[]>();

  for (const def of ordered) {
    const type = def.definitionType;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(def);
  }

  return groups;
}
