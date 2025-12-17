/**
 * Transformation functions for workflow definition data.
 *
 * Transforms ref-based input data into ID-based database data.
 * All refs are resolved to IDs at this boundary.
 */

import { ulid } from 'ulid';
import type { NodeInput, TransitionInput, WorkflowDefInput } from './validator';

/** Pre-generated IDs for all entities */
export type GeneratedIds = {
  workflowDefId: string;
  nodeIds: Map<string, string>; // ref → id
  transitionIds: Map<string, string>; // ref → id (for transitions with refs)
};

/** Transformed node ready for database insertion */
export type TransformedNode = {
  id: string;
  ref: string;
  name: string;
  task_id: string | null;
  task_version: number | null;
  input_mapping: object | null;
  output_mapping: object | null;
  resource_bindings: Record<string, string> | null;
};

/** Transformed transition ready for database insertion */
export type TransformedTransition = {
  id: string;
  ref: string | null;
  from_node_id: string;
  to_node_id: string;
  priority: number;
  condition: object | null;
  spawn_count: number | null;
  sibling_group: string | null; // Named sibling group for fan-in coordination
  foreach: object | null;
  synchronization: {
    strategy: string;
    sibling_group: string; // References either a named group or transition ref
    merge?: object;
  } | null;
  loop_config: object | null;
};

/** Result of transformation */
export type TransformResult = {
  ids: GeneratedIds;
  initialNodeId: string;
  nodes: TransformedNode[];
  transitions: TransformedTransition[];
};

/**
 * Pre-generates all IDs and builds ref→ID maps.
 * This must be called before any database operations so we know all IDs upfront.
 */
export function generateIds(data: WorkflowDefInput): GeneratedIds {
  const workflowDefId = ulid();

  // Generate node IDs
  const nodeIds = new Map<string, string>();
  for (const node of data.nodes) {
    nodeIds.set(node.ref, ulid());
  }

  // Generate transition IDs
  // IMPORTANT: We need to map ALL transitions by ref, not just ones with refs,
  // because synchronization.sibling_group references transitions by ref
  const transitionIds = new Map<string, string>();
  for (const transition of data.transitions ?? []) {
    if (transition.ref) {
      transitionIds.set(transition.ref, ulid());
    }
  }

  return { workflowDefId, nodeIds, transitionIds };
}

/**
 * Transforms all ref-based input data into ID-based data.
 * All refs are resolved to IDs at this boundary.
 */
export function transformWorkflowDef(data: WorkflowDefInput, ids: GeneratedIds): TransformResult {
  const initialNodeId = ids.nodeIds.get(data.initial_node_ref)!;

  const nodes = transformNodes(data.nodes, ids.nodeIds);
  const transitions = transformTransitions(data.transitions ?? [], ids);

  return {
    ids,
    initialNodeId,
    nodes,
    transitions,
  };
}

/**
 * Transforms nodes from input format to database format.
 */
function transformNodes(nodes: NodeInput[], nodeIds: Map<string, string>): TransformedNode[] {
  return nodes.map((node) => ({
    id: nodeIds.get(node.ref)!,
    ref: node.ref,
    name: node.name,
    task_id: node.task_id ?? null,
    task_version: node.task_version ?? null,
    input_mapping: node.input_mapping ?? null,
    output_mapping: node.output_mapping ?? null,
    resource_bindings: node.resource_bindings ?? null,
  }));
}

/**
 * Transforms transitions from input format to database format.
 * This is where sibling_group ref → ID resolution happens!
 */
function transformTransitions(
  transitions: TransitionInput[],
  ids: GeneratedIds,
): TransformedTransition[] {
  // Build a map from transition ref to its generated ID
  // We need this to resolve sibling_group refs for spawn_count pattern
  const transitionRefToId = ids.transitionIds;

  return transitions.map((transition, index) => {
    // Get or generate the transition ID
    const transitionId = transition.ref ? transitionRefToId.get(transition.ref)! : ulid(); // Generate for transitions without refs

    // Transform synchronization
    const transformedSync = transformSynchronization(transition.synchronization, transitionRefToId);

    return {
      id: transitionId,
      ref: transition.ref ?? null,
      from_node_id: ids.nodeIds.get(transition.from_node_ref)!,
      to_node_id: ids.nodeIds.get(transition.to_node_ref)!,
      priority: transition.priority,
      condition: transition.condition ?? null,
      spawn_count: transition.spawn_count ?? null,
      sibling_group: transition.sibling_group ?? null,
      foreach: transition.foreach ?? null,
      synchronization: transformedSync,
      loop_config: transition.loop_config ?? null,
    };
  });
}

/**
 * Transforms synchronization config - keeps sibling_group as string identifier.
 * No longer resolves to ID - sibling_group is now a semantic string shared across transitions.
 */
function transformSynchronization(
  sync: TransitionInput['synchronization'],
  transitionRefToId: Map<string, string>,
): TransformedTransition['synchronization'] {
  if (!sync) {
    return null;
  }

  // Keep sibling_group as-is - it's now a string identifier, not a ref to resolve
  return {
    strategy: sync.strategy,
    sibling_group: sync.sibling_group,
    merge: sync.merge,
  };
}
