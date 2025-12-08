/**
 * Node builder - Ergonomic helper for creating workflow nodes
 *
 * Returns a plain typed object that matches CreateWorkflowDef['nodes'][number].
 */

import type { components } from '../generated/schema';

type NodeConfig = components['schemas']['CreateWorkflowDef']['nodes'][number];

/**
 * Create a workflow node
 *
 * @example
 * const myNode = node({
 *   ref: 'process',
 *   name: 'Process Data',
 *   action_id: 'my-action-id',
 *   action_version: 1,
 *   input_mapping: {
 *     data: '$.input.rawData'
 *   }
 * });
 */
export function node(config: NodeConfig): NodeConfig {
  return {
    ref: config.ref,
    name: config.name,
    ...(config.action_id !== undefined && { action_id: config.action_id }),
    ...(config.action_version !== undefined && { action_version: config.action_version }),
    ...(config.input_mapping !== undefined && { input_mapping: config.input_mapping }),
    ...(config.output_mapping !== undefined && { output_mapping: config.output_mapping }),
  };
}
