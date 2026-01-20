import type { Diagnostic, Range } from '../types/diagnostics.js';
import { DiagnosticSeverity } from '../types/diagnostics.js';
import { formatReference, referencesEqual } from './reference.js';
import {
  STANDARD_LIBRARY_WORKSPACE_NAME,
  type Reference,
  type StandardLibraryManifest,
  type Workspace,
  type WorkspaceDefinition,
  type WorkspaceValidationResult,
} from './types.js';

/**
 * Default range for diagnostics when no specific location is available
 */
const DEFAULT_RANGE: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

/**
 * Diagnostic codes for workspace validation
 */
export const DiagnosticCodes = {
  UNRESOLVED_WORKSPACE_REF: 'UNRESOLVED_WORKSPACE_REF',
  UNRESOLVED_LIBRARY_REF: 'UNRESOLVED_LIBRARY_REF',
  UNRESOLVED_PROJECT_REF: 'UNRESOLVED_PROJECT_REF',
  UNRESOLVED_STANDARD_LIBRARY_REF: 'UNRESOLVED_STANDARD_LIBRARY_REF',
  DEPENDENCY_CYCLE: 'DEPENDENCY_CYCLE',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
} as const;

/**
 * Check if a reference can be resolved within the workspace
 */
function resolveWorkspaceReference(
  ref: Reference,
  workspace: Workspace,
): WorkspaceDefinition | null {
  const refKey = formatReference(ref);
  return workspace.definitions.get(refKey) ?? null;
}

/**
 * Check if a reference can be resolved against the standard library manifest
 */
function resolveStandardLibraryReference(
  ref: Reference,
  manifest: StandardLibraryManifest,
): boolean {
  if (ref.scope !== 'standardLibrary') return false;

  const library = manifest.libraries[ref.library];
  if (!library) return false;

  return ref.name in library;
}

/**
 * Detect cycles in the dependency graph using DFS
 *
 * Returns an array of cycles, where each cycle is an array of references
 * forming the cycle (including the starting reference at the end to complete the loop).
 */
function detectCycles(dependencyGraph: Map<string, Reference[]>): Reference[][] {
  const cycles: Reference[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: Reference[] = [];

  // Build a lookup from refKey to Reference
  const refKeyToRef = new Map<string, Reference>();
  for (const [refKey, deps] of dependencyGraph) {
    // We need to parse the reference back - for now, store the first dep's source
    // Actually, we need to track the source reference for each key
  }

  function dfs(refKey: string, ref: Reference): void {
    visited.add(refKey);
    recursionStack.add(refKey);
    path.push(ref);

    const deps = dependencyGraph.get(refKey) ?? [];

    for (const dep of deps) {
      const depKey = formatReference(dep);

      if (!visited.has(depKey)) {
        dfs(depKey, dep);
      } else if (recursionStack.has(depKey)) {
        // Found a cycle - extract from path
        const cycleStartIdx = path.findIndex((r) => formatReference(r) === depKey);
        if (cycleStartIdx !== -1) {
          const cycle = path.slice(cycleStartIdx);
          cycle.push(dep); // Complete the cycle
          cycles.push(cycle);
        }
      }
    }

    path.pop();
    recursionStack.delete(refKey);
  }

  // We need to track the original reference for each key
  // Build this from workspace definitions
  for (const refKey of dependencyGraph.keys()) {
    if (!visited.has(refKey)) {
      // Parse the refKey back to a Reference
      // For now, we'll need to get this from the workspace
      // This is a bit awkward - let's refactor
    }
  }

  return cycles;
}

/**
 * Detect cycles using workspace definitions directly
 */
function detectDependencyCycles(workspace: Workspace): Reference[][] {
  const cycles: Reference[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: Reference[] = [];

  function dfs(def: WorkspaceDefinition): void {
    const refKey = formatReference(def.reference);
    visited.add(refKey);
    recursionStack.add(refKey);
    path.push(def.reference);

    for (const dep of def.dependencies) {
      const depKey = formatReference(dep);
      const depDef = workspace.definitions.get(depKey);

      if (depDef && !visited.has(depKey)) {
        dfs(depDef);
      } else if (depDef && recursionStack.has(depKey)) {
        // Found a cycle
        const cycleStartIdx = path.findIndex((r) => formatReference(r) === depKey);
        if (cycleStartIdx !== -1) {
          const cycle = path.slice(cycleStartIdx);
          cycle.push(dep); // Complete the cycle
          cycles.push(cycle);
        }
      }
    }

    path.pop();
    recursionStack.delete(refKey);
  }

  for (const def of workspace.definitions.values()) {
    const refKey = formatReference(def.reference);
    if (!visited.has(refKey)) {
      dfs(def);
    }
  }

  return cycles;
}

/**
 * Validate a workspace, checking cross-file references and detecting cycles
 */
export function validateWorkspace(
  workspace: Workspace,
  standardLibrary?: StandardLibraryManifest,
): WorkspaceValidationResult {
  const diagnosticsByFile = new Map<string, Diagnostic[]>();
  const allDiagnostics: Diagnostic[] = [];
  const dependencyGraph = new Map<string, Reference[]>();

  // Helper to add a diagnostic
  function addDiagnostic(filePath: string, diagnostic: Diagnostic): void {
    if (!diagnosticsByFile.has(filePath)) {
      diagnosticsByFile.set(filePath, []);
    }
    diagnosticsByFile.get(filePath)!.push(diagnostic);
    allDiagnostics.push(diagnostic);
  }

  // Validate each definition's dependencies
  for (const def of workspace.definitions.values()) {
    const refKey = formatReference(def.reference);
    dependencyGraph.set(refKey, def.dependencies);

    for (const dep of def.dependencies) {
      const resolved = resolveReference(dep, workspace, standardLibrary);

      if (!resolved) {
        const diagnostic = createUnresolvedReferenceDiagnostic(dep, def);
        addDiagnostic(def.filePath, diagnostic);
      }
    }
  }

  // Detect cycles
  const cycles = detectDependencyCycles(workspace);

  for (const cycle of cycles) {
    // Add a diagnostic to the first definition in the cycle
    const firstRef = cycle[0];
    const firstRefKey = formatReference(firstRef);
    const firstDef = workspace.definitions.get(firstRefKey);

    if (firstDef) {
      const cycleStr = cycle.map(formatReference).join(' → ');
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: DEFAULT_RANGE,
        message: `Circular dependency detected: ${cycleStr}`,
        source: 'wflow',
        code: DiagnosticCodes.DEPENDENCY_CYCLE,
      };
      addDiagnostic(firstDef.filePath, diagnostic);
    }
  }

  const valid = allDiagnostics.every((d) => d.severity !== DiagnosticSeverity.Error);

  return {
    valid,
    diagnosticsByFile,
    allDiagnostics,
    dependencyGraph,
    cycles,
  };
}

/**
 * Resolve a reference against the workspace and optionally the standard library
 */
function resolveReference(
  ref: Reference,
  workspace: Workspace,
  standardLibrary?: StandardLibraryManifest,
): WorkspaceDefinition | 'standard-library' | null {
  switch (ref.scope) {
    case 'workspace':
    case 'workspaceLibrary':
    case 'project':
      return resolveWorkspaceReference(ref, workspace);

    case 'standardLibrary': {
      // When deploying the standard library workspace itself, standard library
      // references should resolve against the workspace being deployed
      if (workspace.config?.name === STANDARD_LIBRARY_WORKSPACE_NAME) {
        const localDef = resolveWorkspaceReference(ref, workspace);
        if (localDef) return localDef;
      }

      if (standardLibrary && resolveStandardLibraryReference(ref, standardLibrary)) {
        return 'standard-library';
      }
      // If no manifest provided, we can't validate standard library refs
      // Return a sentinel to indicate "unknown" rather than "definitely missing"
      if (!standardLibrary) {
        return 'standard-library'; // Assume valid when we can't check
      }
      return null;
    }
  }
}

/**
 * Create a diagnostic for an unresolved reference
 */
function createUnresolvedReferenceDiagnostic(
  ref: Reference,
  def: WorkspaceDefinition,
): Diagnostic {
  const refStr = formatReference(ref);

  let code: string;
  let message: string;

  switch (ref.scope) {
    case 'workspace':
      code = DiagnosticCodes.UNRESOLVED_WORKSPACE_REF;
      message = `Unresolved reference: "${refStr}" not found in workspace`;
      break;
    case 'workspaceLibrary':
      code = DiagnosticCodes.UNRESOLVED_LIBRARY_REF;
      message = `Unresolved reference: "${refStr}" not found in workspace library "${ref.library}"`;
      break;
    case 'project':
      code = DiagnosticCodes.UNRESOLVED_PROJECT_REF;
      message = `Unresolved reference: "${refStr}" not found in project "${ref.project}"`;
      break;
    case 'standardLibrary':
      code = DiagnosticCodes.UNRESOLVED_STANDARD_LIBRARY_REF;
      message = `Unresolved reference: "${refStr}" not found in standard library "${ref.library}"`;
      break;
  }

  return {
    severity: DiagnosticSeverity.Error,
    range: DEFAULT_RANGE,
    message,
    source: 'wflow',
    code,
  };
}

/**
 * Resolve a single reference and return whether it's valid
 *
 * Exported for use in CLI commands that need to resolve individual references.
 */
export function canResolveReference(
  ref: Reference,
  workspace: Workspace,
  standardLibrary?: StandardLibraryManifest,
): boolean {
  return resolveReference(ref, workspace, standardLibrary) !== null;
}
