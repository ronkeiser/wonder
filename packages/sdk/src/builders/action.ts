/**
 * Action builder - Ergonomic helper for creating actions
 *
 * Returns a plain typed object that matches CreateAction.
 * When used with createWorkflow, can embed promptSpec and modelProfile for automatic creation.
 */

import type { components } from '../generated/schema';
import {
  ACTION,
  type EmbeddedAction,
  type EmbeddedModelProfile,
  type EmbeddedPromptSpec,
} from './embedded';

type CreateAction = components['schemas']['CreateAction'];

type ActionKind =
  | 'llm_call'
  | 'mcp_tool'
  | 'http_request'
  | 'human_input'
  | 'update_context'
  | 'write_artifact'
  | 'workflow_call'
  | 'vector_search'
  | 'emit_metric'
  | 'mock';

/**
 * Create an action definition
 *
 * @example
 * // With IDs (traditional)
 * const myAction = action({
 *   name: 'Generate Summary',
 *   description: 'Generates a summary using LLM',
 *   kind: 'llm_call',
 *   implementation: {
 *     prompt_spec_id: 'existing-id',
 *     model_profile_id: 'existing-id'
 *   }
 * });
 *
 * // With embedded objects (auto-created by createWorkflow)
 * const myAction = action({
 *   name: 'Generate Summary',
 *   description: 'Generates a summary using LLM',
 *   kind: 'llm_call',
 *   implementation: {
 *     prompt_spec: promptSpec({...}),  // will be created automatically
 *   }
 * });
 */
export function action(config: {
  name: string;
  description: string;
  version?: number;
  kind: ActionKind;
  implementation: {
    prompt_spec_id?: string;
    prompt_spec?: EmbeddedPromptSpec;
    model_profile_id?: string;
    model_profile?: EmbeddedModelProfile;
    [key: string]: unknown;
  };
  requires?: Record<string, unknown>;
  produces?: Record<string, unknown>;
  execution?: Record<string, unknown>;
  idempotency?: Record<string, unknown>;
}): EmbeddedAction {
  return {
    [ACTION]: true,
    name: config.name,
    description: config.description,
    version: config.version ?? 1,
    kind: config.kind,
    implementation: config.implementation,
    requires: config.requires,
    produces: config.produces,
    execution: config.execution,
    idempotency: config.idempotency,
  };
}
