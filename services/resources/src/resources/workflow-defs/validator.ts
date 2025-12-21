/**
 * Validation functions for workflow definition data.
 *
 * Pure validation - no side effects, no database access.
 * All validation happens before any database operations.
 */

import { ValidationError } from '~/shared/errors';

/** Input types for validation */
export type NodeInput = {
  ref: string;
  name: string;
  taskId?: string;
  taskVersion?: number;
  inputMapping?: object;
  outputMapping?: object;
  resourceBindings?: Record<string, string>;
};

export type TransitionInput = {
  ref?: string;
  fromNodeRef: string;
  toNodeRef: string;
  priority: number;
  condition?: string; // Expression string (e.g., "state.score >= 80")
  spawnCount?: number;
  siblingGroup?: string; // Named sibling group identifier for fan-out coordination
  foreach?: object;
  synchronization?: {
    strategy: string;
    siblingGroup: string; // Must reference a declared siblingGroup
    merge?: object;
  };
  loopConfig?: object;
};

export type WorkflowDefInput = {
  name: string;
  description: string;
  projectId?: string;
  libraryId?: string;
  tags?: string[];
  inputSchema: object;
  outputSchema: object;
  outputMapping?: object;
  contextSchema?: object;
  initialNodeRef: string;
  nodes: NodeInput[];
  transitions?: TransitionInput[];
  autoversion?: boolean;
};

/** Validation result with collected refs for transformation */
export type ValidationResult = {
  nodeRefs: Set<string>;
  transitionRefs: Set<string>;
};

/**
 * Validates workflow definition input data.
 * Throws ValidationError if any validation fails.
 * Returns sets of refs for use by transformer.
 */
export function validateWorkflowDef(data: WorkflowDefInput): ValidationResult {
  const nodeRefs = validateNodeRefs(data.nodes);
  const transitionRefs = validateTransitionRefs(data.transitions ?? []);

  validateTransitionNodeRefs(data.transitions ?? [], nodeRefs);
  validateInitialNodeRef(data.initialNodeRef, nodeRefs);
  validateOwnership(data.projectId, data.libraryId);
  validateSiblingGroups(data.transitions ?? [], transitionRefs);

  return { nodeRefs, transitionRefs };
}

/**
 * Validates all node refs are unique.
 * Returns the set of node refs.
 */
function validateNodeRefs(nodes: NodeInput[]): Set<string> {
  const nodeRefs = new Set<string>();

  for (const node of nodes) {
    if (nodeRefs.has(node.ref)) {
      throw new ValidationError(
        `Duplicate node ref: ${node.ref}`,
        `nodes[${node.ref}]`,
        'DUPLICATE_NODE_REF',
      );
    }
    nodeRefs.add(node.ref);
  }

  return nodeRefs;
}

/**
 * Validates all transition refs are unique.
 * Returns the set of transition refs.
 */
function validateTransitionRefs(transitions: TransitionInput[]): Set<string> {
  const transitionRefs = new Set<string>();

  for (const transition of transitions) {
    if (transition.ref) {
      if (transitionRefs.has(transition.ref)) {
        throw new ValidationError(
          `Duplicate transition ref: ${transition.ref}`,
          `transitions[${transition.ref}]`,
          'DUPLICATE_TRANSITION_REF',
        );
      }
      transitionRefs.add(transition.ref);
    }
  }

  return transitionRefs;
}

/**
 * Validates all transition fromNodeRef and toNodeRef point to valid nodes.
 */
function validateTransitionNodeRefs(transitions: TransitionInput[], nodeRefs: Set<string>): void {
  for (const transition of transitions) {
    if (!nodeRefs.has(transition.fromNodeRef)) {
      throw new ValidationError(
        `Invalid fromNodeRef: ${transition.fromNodeRef}`,
        'transitions.fromNodeRef',
        'INVALID_NODE_REF',
      );
    }
    if (!nodeRefs.has(transition.toNodeRef)) {
      throw new ValidationError(
        `Invalid toNodeRef: ${transition.toNodeRef}`,
        'transitions.toNodeRef',
        'INVALID_NODE_REF',
      );
    }
  }
}

/**
 * Validates initial_node_ref points to a valid node.
 */
function validateInitialNodeRef(initialNodeRef: string, nodeRefs: Set<string>): void {
  if (!nodeRefs.has(initialNodeRef)) {
    throw new ValidationError(
      `Invalid initialNodeRef: ${initialNodeRef}`,
      'initial_node_ref',
      'INVALID_NODE_REF',
    );
  }
}

/**
 * Validates exactly one of project_id or library_id is set.
 */
function validateOwnership(projectId?: string, libraryId?: string): void {
  if (!projectId && !libraryId) {
    throw new ValidationError(
      'Either project_id or library_id must be provided',
      'project_id|library_id',
      'MISSING_OWNER',
    );
  }
  if (projectId && libraryId) {
    throw new ValidationError(
      'Cannot specify both project_id and library_id',
      'project_id|library_id',
      'MULTIPLE_OWNERS',
    );
  }
}

/**
 * Validates siblingGroup usage across transitions.
 *
 * synchronization.siblingGroup must reference a siblingGroup declared on one or more transitions.
 * This is the only way to create sibling relationships for fan-in coordination.
 */
function validateSiblingGroups(transitions: TransitionInput[], _transitionRefs: Set<string>): void {
  // Collect all declared sibling groups (from transition.siblingGroup)
  const declaredGroups = new Set<string>();
  for (const transition of transitions) {
    if (transition.siblingGroup) {
      declaredGroups.add(transition.siblingGroup);
    }
  }

  // Validate synchronization config
  for (const transition of transitions) {
    if (transition.synchronization) {
      const sync = transition.synchronization;

      // Validate siblingGroup reference
      if (!declaredGroups.has(sync.siblingGroup)) {
        throw new ValidationError(
          `Invalid synchronization.siblingGroup: '${sync.siblingGroup}' is not a declared sibling group`,
          'transitions.synchronization.siblingGroup',
          'INVALID_SIBLING_GROUP',
        );
      }

      // Validate strategy format
      validateStrategy(sync.strategy);
    }
  }
}

/**
 * Validates synchronization strategy format.
 *
 * Valid formats:
 * - "any" - first arrival proceeds
 * - "all" - wait for all siblings
 * - "m_of_n:N" - wait for N siblings (e.g., "m_of_n:2")
 */
function validateStrategy(strategy: string): void {
  if (strategy === 'any' || strategy === 'all') {
    return;
  }

  const match = strategy.match(/^m_of_n:(\d+)$/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n < 1) {
      throw new ValidationError(
        `Invalid m_of_n value: ${n}. Must be at least 1`,
        'transitions.synchronization.strategy',
        'INVALID_STRATEGY',
      );
    }
    return;
  }

  throw new ValidationError(
    `Invalid synchronization strategy: '${strategy}'. Must be 'any', 'all', or 'm_of_n:N'`,
    'transitions.synchronization.strategy',
    'INVALID_STRATEGY',
  );
}
