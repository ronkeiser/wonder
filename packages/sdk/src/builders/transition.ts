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
 *   fromNodeRef: 'start',
 *   toNodeRef: 'end',
 *   priority: 1,
 *   condition: { expression: 'true' }
 * });
 */
export function transition(config: TransitionConfig): TransitionConfig {
  return {
    fromNodeRef: config.fromNodeRef,
    toNodeRef: config.toNodeRef,
    priority: config.priority,
    ...(config.ref !== undefined && { ref: config.ref }),
    ...(config.condition !== undefined && { condition: config.condition }),
    ...(config.spawnCount !== undefined && { spawnCount: config.spawnCount }),
    ...(config.siblingGroup !== undefined && { siblingGroup: config.siblingGroup }),
    ...(config.foreach !== undefined && { foreach: config.foreach }),
    ...(config.synchronization !== undefined && { synchronization: config.synchronization }),
    ...(config.loopConfig !== undefined && { loopConfig: config.loopConfig }),
  };
}
