/**
 * Builder exports
 *
 * These are ergonomic helpers for creating workflow definitions.
 * All return plain typed objects - no magic, just convenience.
 *
 * Builders can be nested: promptSpec → action → step → task → node → workflow
 * When passed to createWorkflow, embedded objects are created in dependency order.
 */

export { action } from './action';
export {
  isEmbeddedAction,
  isEmbeddedModelProfile,
  isEmbeddedNode,
  isEmbeddedPromptSpec,
  isEmbeddedTask,
  isEmbeddedWorkflowDef,
  type EmbeddedAction,
  type EmbeddedModelProfile,
  type EmbeddedNode,
  type EmbeddedPromptSpec,
  type EmbeddedStep,
  type EmbeddedTask,
  type EmbeddedWorkflowDef,
} from './embedded';
export { modelProfile } from './model-profile';
export { node } from './node';
export { promptSpec } from './prompt-spec';
export { schema } from './schema';
export { step, task } from './task';
export { transition } from './transition';
export { workflow } from './workflow';
