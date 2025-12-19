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
  task_id?: string;
  task_version?: number;
  input_mapping?: object;
  output_mapping?: object;
  resource_bindings?: Record<string, string>;
};

export type TransitionInput = {
  ref?: string;
  from_node_ref: string;
  to_node_ref: string;
  priority: number;
  condition?: object;
  spawn_count?: number;
  sibling_group?: string; // Named sibling group identifier for fan-out coordination
  foreach?: object;
  synchronization?: {
    strategy: string;
    sibling_group: string; // Must reference a declared sibling_group
    merge?: object;
  };
  loop_config?: object;
};

export type WorkflowDefInput = {
  name: string;
  description: string;
  project_id?: string;
  library_id?: string;
  tags?: string[];
  input_schema: object;
  output_schema: object;
  output_mapping?: object;
  context_schema?: object;
  initial_node_ref: string;
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
  validateInitialNodeRef(data.initial_node_ref, nodeRefs);
  validateOwnership(data.project_id, data.library_id);
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
 * Validates all transition from_node_ref and to_node_ref point to valid nodes.
 */
function validateTransitionNodeRefs(transitions: TransitionInput[], nodeRefs: Set<string>): void {
  for (const transition of transitions) {
    if (!nodeRefs.has(transition.from_node_ref)) {
      throw new ValidationError(
        `Invalid from_node_ref: ${transition.from_node_ref}`,
        'transitions.from_node_ref',
        'INVALID_NODE_REF',
      );
    }
    if (!nodeRefs.has(transition.to_node_ref)) {
      throw new ValidationError(
        `Invalid to_node_ref: ${transition.to_node_ref}`,
        'transitions.to_node_ref',
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
      `Invalid initial_node_ref: ${initialNodeRef}`,
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
 * Validates sibling_group usage across transitions.
 *
 * synchronization.sibling_group must reference a sibling_group declared on one or more transitions.
 * This is the only way to create sibling relationships for fan-in coordination.
 */
function validateSiblingGroups(transitions: TransitionInput[], _transitionRefs: Set<string>): void {
  // Collect all declared sibling groups (from transition.sibling_group)
  const declaredGroups = new Set<string>();
  for (const transition of transitions) {
    if (transition.sibling_group) {
      declaredGroups.add(transition.sibling_group);
    }
  }

  // Validate synchronization.sibling_group references
  for (const transition of transitions) {
    if (transition.synchronization?.sibling_group) {
      const siblingGroupRef = transition.synchronization.sibling_group;

      if (!declaredGroups.has(siblingGroupRef)) {
        throw new ValidationError(
          `Invalid synchronization.sibling_group: '${siblingGroupRef}' is not a declared sibling group`,
          'transitions.synchronization.sibling_group',
          'INVALID_SIBLING_GROUP',
        );
      }
    }
  }
}
