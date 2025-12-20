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
 *   projectId: 'my-project-id',
 *   inputSchema: schema.object({ ... }),
 *   outputSchema: schema.object({ ... }),
 *   initialNodeRef: 'start',
 *   nodes: [
 *     node({ ref: 'start', name: 'Start', ... }),
 *     node({ ref: 'end', name: 'End', ... })
 *   ],
 *   transitions: [
 *     transition({ fromNodeRef: 'start', toNodeRef: 'end', priority: 1 })
 *   ]
 * });
 */
export function workflow(config: WorkflowDefConfig): EmbeddedWorkflowDef {
  // Validate that initialNodeRef exists in nodes
  const nodeRefs = new Set(config.nodes.map((n) => n.ref));
  if (!nodeRefs.has(config.initialNodeRef)) {
    throw new Error(
      `initialNodeRef '${config.initialNodeRef}' does not match any node ref. ` +
        `Available nodes: ${Array.from(nodeRefs).join(', ')}`,
    );
  }

  // Validate transitions reference existing nodes
  if (config.transitions) {
    for (const transition of config.transitions) {
      if (!nodeRefs.has(transition.fromNodeRef)) {
        throw new Error(
          `Transition fromNodeRef '${transition.fromNodeRef}' does not match any node ref`,
        );
      }
      if (!nodeRefs.has(transition.toNodeRef)) {
        throw new Error(
          `Transition toNodeRef '${transition.toNodeRef}' does not match any node ref`,
        );
      }
    }
  }

  return {
    [WORKFLOW_DEF]: true,
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    initialNodeRef: config.initialNodeRef,
    nodes: config.nodes,
    ...(config.projectId !== undefined && { projectId: config.projectId }),
    ...(config.libraryId !== undefined && { libraryId: config.libraryId }),
    ...(config.tags !== undefined && { tags: config.tags }),
    ...(config.contextSchema !== undefined && { contextSchema: config.contextSchema }),
    ...(config.outputMapping !== undefined && { outputMapping: config.outputMapping }),
    ...(config.transitions !== undefined && { transitions: config.transitions }),
  };
}
