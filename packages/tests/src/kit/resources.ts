/**
 * Embedded Resource Creation
 *
 * Internal helpers for creating embedded resources (task defs, actions, prompt specs)
 * from workflow definitions.
 */

import {
  isEmbeddedAction,
  isEmbeddedModelProfile,
  isEmbeddedPromptSpec,
  type EmbeddedAction,
  type EmbeddedPromptSpec,
  type EmbeddedStep,
  type EmbeddedTaskDef,
} from '@wonder/sdk';
import { wonder } from '~/client';
import type { CreatedResources, TestContext } from './types';

export type { CreatedResources } from './types';

/**
 * Creates an embedded task def and all its dependencies (actions, prompt specs).
 * @internal
 */
export async function createEmbeddedTaskDef(
  ctx: TestContext,
  taskDef: EmbeddedTaskDef,
  createdResources: CreatedResources,
): Promise<string> {
  // Process steps to resolve embedded actions
  const resolvedSteps: Array<{
    ref: string;
    ordinal: number;
    action_id: string;
    action_version: number;
    input_mapping?: Record<string, unknown> | null;
    output_mapping?: Record<string, unknown> | null;
    on_failure?: 'abort' | 'retry' | 'continue';
    condition?: {
      if: string;
      then: 'continue' | 'skip' | 'succeed' | 'fail';
      else: 'continue' | 'skip' | 'succeed' | 'fail';
    } | null;
  }> = [];

  for (const s of taskDef.steps as EmbeddedStep[]) {
    let actionId: string;
    let actionVersion: number;

    if (s.action_id) {
      // Reference to existing action - get latest version
      const actionResponse = await wonder.actions(s.action_id).get();
      actionId = actionResponse.action.id;
      actionVersion = actionResponse.action.version;
    } else if (s.action && isEmbeddedAction(s.action)) {
      // Embedded action - create and use returned version
      const result = await createEmbeddedAction(ctx, s.action, createdResources);
      actionId = result.id;
      actionVersion = result.version;
    } else {
      throw new Error(`Step ${s.ref} must have either action_id or action`);
    }

    resolvedSteps.push({
      ref: s.ref,
      ordinal: s.ordinal,
      action_id: actionId,
      action_version: actionVersion,
      input_mapping: s.input_mapping ?? null,
      output_mapping: s.output_mapping ?? null,
      on_failure: s.on_failure ?? 'abort',
      condition: s.condition ?? null,
    });
  }

  // Create task with resolved steps
  const resolvedTask = {
    name: taskDef.name,
    description: taskDef.description,
    version: 1,
    project_id: ctx.projectId,
    library_id: taskDef.library_id,
    tags: taskDef.tags,
    input_schema: taskDef.input_schema,
    output_schema: taskDef.output_schema,
    steps: resolvedSteps,
    retry: taskDef.retry,
    timeout_ms: taskDef.timeout_ms,
  };

  const response = await wonder.tasks.create(resolvedTask as any);
  if (!response?.task?.id) {
    throw new Error('Failed to create task');
  }

  createdResources.taskIds.push(response.task.id);
  return response.task.id;
}

/**
 * Creates an embedded action and its dependencies (prompt specs, model profiles).
 * @internal
 */
export async function createEmbeddedAction(
  ctx: TestContext,
  action: EmbeddedAction,
  createdResources: CreatedResources,
): Promise<{ id: string; version: number }> {
  const implementation = { ...action.implementation };

  // Resolve embedded prompt spec
  if (implementation.prompt_spec && isEmbeddedPromptSpec(implementation.prompt_spec)) {
    const promptSpecId = await createEmbeddedPromptSpec(
      implementation.prompt_spec,
      createdResources,
    );
    implementation.prompt_spec_id = promptSpecId;
    delete implementation.prompt_spec;
  }

  // Resolve embedded model profile if provided
  if (implementation.model_profile && isEmbeddedModelProfile(implementation.model_profile)) {
    const mpResponse = await wonder.modelProfiles.create({
      name: implementation.model_profile.name,
      provider: implementation.model_profile.provider,
      model_id: implementation.model_profile.model_id,
      parameters: implementation.model_profile.parameters,
      execution_config: implementation.model_profile.execution_config,
      cost_per_1k_input_tokens: implementation.model_profile.cost_per_1k_input_tokens ?? 0,
      cost_per_1k_output_tokens: implementation.model_profile.cost_per_1k_output_tokens ?? 0,
    });
    implementation.model_profile_id = mpResponse.model_profile.id;
    delete implementation.model_profile;
  }

  // Create action
  const response = await wonder.actions.create({
    name: action.name,
    description: action.description,
    version: 1,
    kind: action.kind,
    implementation,
    requires: action.requires,
    produces: action.produces,
    execution: action.execution,
    idempotency: action.idempotency,
  });

  if (!response?.action?.id) {
    throw new Error('Failed to create action');
  }

  createdResources.actionIds.push(response.action.id);
  return { id: response.action.id, version: response.action.version };
}

/**
 * Creates an embedded prompt spec.
 * @internal
 */
export async function createEmbeddedPromptSpec(
  promptSpec: EmbeddedPromptSpec,
  createdResources: CreatedResources,
): Promise<string> {
  const response = await wonder.promptSpecs.create({
    name: promptSpec.name,
    description: promptSpec.description,
    version: 1,
    system_prompt: promptSpec.system_prompt,
    template: promptSpec.template,
    template_language: promptSpec.template_language,
    requires: promptSpec.requires,
    produces: promptSpec.produces,
    examples: promptSpec.examples,
    tags: promptSpec.tags,
  });

  if (!response?.prompt_spec_id) {
    throw new Error('Failed to create prompt spec');
  }

  createdResources.promptSpecIds.push(response.prompt_spec_id);
  return response.prompt_spec_id;
}
