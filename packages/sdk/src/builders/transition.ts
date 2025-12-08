/**
 * Transition builder - Ergonomic helper for creating workflow transitions
 *
 * Returns a plain typed object that matches CreateWorkflowDef['transitions'][number].
 */

import type { components } from '../generated/schema';

type TransitionConfig = NonNullable<
  components['schemas']['CreateWorkflowDef']['transitions']
>[number];

type Butt = components['schemas']['CreateWorkflowDef']['transitions'];

/**
 * Create a workflow transition
 *
 * @example
 * const myTransition = transition({
 *   from_node_ref: 'start',
 *   to_node_ref: 'end',
 *   priority: 1,
 *   condition: { expression: 'true' }
 * });
 */
export function transition(config: TransitionConfig): TransitionConfig {
  return {
    from_node_ref: config.from_node_ref,
    to_node_ref: config.to_node_ref,
    priority: config.priority,
    ...(config.ref !== undefined && { ref: config.ref }),
    ...(config.condition !== undefined && { condition: config.condition }),
    ...(config.spawn_count !== undefined && { spawn_count: config.spawn_count }),
    ...(config.foreach !== undefined && { foreach: config.foreach }),
    ...(config.synchronization !== undefined && { synchronization: config.synchronization }),
    ...(config.loop_config !== undefined && { loop_config: config.loop_config }),
  };
}
