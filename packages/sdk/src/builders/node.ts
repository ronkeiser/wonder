/**
 * Node builder - Ergonomic helper for creating workflow nodes
 *
 * Returns a plain typed object that matches CreateWorkflowDef['nodes'][number].
 * Can embed taskDef for automatic creation by createWorkflow.
 */

import type { components } from '../generated/schema';
import { type EmbeddedNode, type EmbeddedTaskDef, type EmbeddedWorkflowDef } from './embedded';

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
 *
 * // With subworkflow ID (invokes another workflow)
 * const myNode = node({
 *   ref: 'invoke_child',
 *   name: 'Invoke Child',
 *   subworkflowId: 'child-workflow-id',
 *   subworkflowVersion: 1,
 *   inputMapping: { message: 'input.message' },
 *   outputMapping: { 'output.result': 'result.output' },
 * });
 */
export function node(config: {
  ref: string;
  name: string;
  // Task execution (mutually exclusive with subworkflowId)
  taskId?: string;
  task?: EmbeddedTaskDef;
  taskVersion?: number;
  // Subworkflow execution (mutually exclusive with taskId/task)
  subworkflowId?: string;
  subworkflow?: EmbeddedWorkflowDef;
  subworkflowVersion?: number;
  // Common
  inputMapping?: Record<string, unknown>;
  outputMapping?: Record<string, unknown>;
  resourceBindings?: Record<string, unknown>;
}): EmbeddedNode {
  const hasTask = config.taskId || config.task;
  const hasSubworkflow = config.subworkflowId || config.subworkflow;

  if (!hasTask && !hasSubworkflow) {
    throw new Error('Node must have either taskId/task or subworkflowId/subworkflow');
  }
  if (hasTask && hasSubworkflow) {
    throw new Error('Node cannot have both task and subworkflow');
  }

  return {
    ref: config.ref,
    name: config.name,
    // Task fields
    ...(config.taskId !== undefined && { taskId: config.taskId }),
    ...(config.task !== undefined && { task: config.task }),
    ...(config.taskVersion !== undefined && { taskVersion: config.taskVersion }),
    // Subworkflow fields
    ...(config.subworkflowId !== undefined && { subworkflowId: config.subworkflowId }),
    ...(config.subworkflow !== undefined && { subworkflow: config.subworkflow }),
    ...(config.subworkflowVersion !== undefined && { subworkflowVersion: config.subworkflowVersion }),
    // Common fields
    ...(config.inputMapping !== undefined && { inputMapping: config.inputMapping }),
    ...(config.outputMapping !== undefined && { outputMapping: config.outputMapping }),
    ...(config.resourceBindings !== undefined && { resourceBindings: config.resourceBindings }),
  };
}
