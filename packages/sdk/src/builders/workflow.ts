/**
 * Workflow definition builder - Ergonomic helper for creating complete workflow definitions
 *
 * Returns a plain typed object that matches CreateWorkflowDef.
 */

import type { components } from '../generated/schema';
import type { EmbeddedNode, EmbeddedWorkflowDef } from './embedded';
import { WORKFLOW_DEF } from './embedded';

type CreateWorkflowDef = components['schemas']['CreateWorkflowDef'];

/** Input config for workflowDef - accepts embedded nodes */
type WorkflowDefConfig = Omit<CreateWorkflowDef, 'nodes'> & {
  nodes: EmbeddedNode[];
};

/**
 * Create a complete workflow definition
 *
 * @example
 * const myWorkflow = workflowDef({
 *   name: 'My Workflow',
 *   description: 'A workflow that does something',
 *   project_id: 'my-project-id',
 *   input_schema: schema.object({ ... }),
 *   output_schema: schema.object({ ... }),
 *   initial_node_ref: 'start',
 *   nodes: [
 *     node({ ref: 'start', name: 'Start', ... }),
 *     node({ ref: 'end', name: 'End', ... })
 *   ],
 *   transitions: [
 *     transition({ from_node_ref: 'start', to_node_ref: 'end', priority: 1 })
 *   ]
 * });
 */
export function workflow(config: WorkflowDefConfig): EmbeddedWorkflowDef {
  // Validate that initial_node_ref exists in nodes
  const nodeRefs = new Set(config.nodes.map((n) => n.ref));
  if (!nodeRefs.has(config.initial_node_ref)) {
    throw new Error(
      `initial_node_ref '${config.initial_node_ref}' does not match any node ref. ` +
        `Available nodes: ${Array.from(nodeRefs).join(', ')}`,
    );
  }

  // Validate transitions reference existing nodes
  if (config.transitions) {
    for (const transition of config.transitions) {
      if (!nodeRefs.has(transition.from_node_ref)) {
        throw new Error(
          `Transition from_node_ref '${transition.from_node_ref}' does not match any node ref`,
        );
      }
      if (!nodeRefs.has(transition.to_node_ref)) {
        throw new Error(
          `Transition to_node_ref '${transition.to_node_ref}' does not match any node ref`,
        );
      }
    }
  }

  return {
    [WORKFLOW_DEF]: true,
    name: config.name,
    description: config.description,
    input_schema: config.input_schema,
    output_schema: config.output_schema,
    initial_node_ref: config.initial_node_ref,
    nodes: config.nodes,
    ...(config.project_id !== undefined && { project_id: config.project_id }),
    ...(config.library_id !== undefined && { library_id: config.library_id }),
    ...(config.tags !== undefined && { tags: config.tags }),
    ...(config.context_schema !== undefined && { context_schema: config.context_schema }),
    ...(config.output_mapping !== undefined && { output_mapping: config.output_mapping }),
    ...(config.transitions !== undefined && { transitions: config.transitions }),
  };
}
