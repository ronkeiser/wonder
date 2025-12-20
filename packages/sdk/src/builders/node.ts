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
 *   taskId: 'my-task-id',
 *   taskVersion: 1,
 *   inputMapping: { data: '$.input.rawData' }
 * });
 *
 * // With embedded task (auto-created by createWorkflow)
 * const myNode = node({
 *   ref: 'process',
 *   name: 'Process Data',
 *   task: taskDef({
 *     steps: [step({ action: action({...}) })]
 *   }),
 *   taskVersion: 1,
 * });
 */
export function node(config: {
  ref: string;
  name: string;
  taskId?: string;
  task?: EmbeddedTaskDef;
  taskVersion?: number;
  inputMapping?: Record<string, unknown>;
  outputMapping?: Record<string, unknown>;
  resourceBindings?: Record<string, unknown>;
}): EmbeddedNode {
  if (!config.taskId && !config.task) {
    throw new Error('Node must have either taskId or task');
  }
  return {
    ref: config.ref,
    name: config.name,
    ...(config.taskId !== undefined && { taskId: config.taskId }),
    ...(config.task !== undefined && { task: config.task }),
    ...(config.taskVersion !== undefined && { taskVersion: config.taskVersion }),
    ...(config.inputMapping !== undefined && { inputMapping: config.inputMapping }),
    ...(config.outputMapping !== undefined && { outputMapping: config.outputMapping }),
    ...(config.resourceBindings !== undefined && { resourceBindings: config.resourceBindings }),
  };
}
