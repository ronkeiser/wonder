/**
 * Node builder - Ergonomic helper for creating workflow nodes
 *
 * Returns a plain typed object that matches CreateWorkflowDef['nodes'][number].
 * Can embed taskDef for automatic creation by createWorkflow.
 */

import type { components } from '../generated/schema';
import { type EmbeddedNode, type EmbeddedTaskDef } from './embedded';

type NodeConfig = components['schemas']['CreateWorkflowDef']['nodes'][number];

/**
 * Create a workflow node
 *
 * @example
 * // With task ID (traditional)
 * const myNode = node({
 *   ref: 'process',
 *   name: 'Process Data',
 *   task_id: 'my-task-id',
 *   task_version: 1,
 *   input_mapping: { data: '$.input.rawData' }
 * });
 *
 * // With embedded task (auto-created by createWorkflow)
 * const myNode = node({
 *   ref: 'process',
 *   name: 'Process Data',
 *   task: taskDef({
 *     steps: [step({ action: action({...}) })]
 *   }),
 *   task_version: 1,
 * });
 */
export function node(config: {
  ref: string;
  name: string;
  task_id?: string;
  task?: EmbeddedTaskDef;
  task_version?: number;
  input_mapping?: Record<string, unknown>;
  output_mapping?: Record<string, unknown>;
  resource_bindings?: Record<string, unknown>;
}): EmbeddedNode {
  if (!config.task_id && !config.task) {
    throw new Error('Node must have either task_id or task');
  }
  return {
    ref: config.ref,
    name: config.name,
    ...(config.task_id !== undefined && { task_id: config.task_id }),
    ...(config.task !== undefined && { task: config.task }),
    ...(config.task_version !== undefined && { task_version: config.task_version }),
    ...(config.input_mapping !== undefined && { input_mapping: config.input_mapping }),
    ...(config.output_mapping !== undefined && { output_mapping: config.output_mapping }),
    ...(config.resource_bindings !== undefined && { resource_bindings: config.resource_bindings }),
  };
}
