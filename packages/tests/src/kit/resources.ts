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
  type EmbeddedTask,
} from '@wonder/sdk';
import { wonder } from '~/client';
import type { CreatedResources, TestContext } from './types';

export type { CreatedResources } from './types';

/**
 * Creates an embedded task def and all its dependencies (actions, prompt specs).
 * @internal
 */
export async function createEmbeddedTask(
  ctx: TestContext,
  taskDef: EmbeddedTask,
  createdResources: CreatedResources,
): Promise<string> {
  // Process steps to resolve embedded actions
  const resolvedSteps: Array<{
    ref: string;
    ordinal: number;
    actionId: string;
    actionVersion: number;
    inputMapping?: Record<string, unknown> | null;
    outputMapping?: Record<string, unknown> | null;
    onFailure?: 'abort' | 'retry' | 'continue';
    condition?: {
      if: string;
      then: 'continue' | 'skip' | 'succeed' | 'fail';
      else: 'continue' | 'skip' | 'succeed' | 'fail';
    } | null;
  }> = [];

  for (const s of taskDef.steps as EmbeddedStep[]) {
    let actionId: string;
    let actionVersion: number;

    if (s.actionId) {
      // Reference to existing action - get latest version
      const actionResponse = await wonder.actions(s.actionId).get();
      actionId = actionResponse.action.id;
      actionVersion = actionResponse.action.version;
    } else if (s.action && isEmbeddedAction(s.action)) {
      // Embedded action - create and use returned version
      const result = await createEmbeddedAction(ctx, s.action, createdResources);
      actionId = result.id;
      actionVersion = result.version;
    } else {
      throw new Error(`Step ${s.ref} must have either actionId or action`);
    }

    resolvedSteps.push({
      ref: s.ref,
      ordinal: s.ordinal,
      actionId: actionId,
      actionVersion: actionVersion,
      inputMapping: s.inputMapping ?? null,
      outputMapping: s.outputMapping ?? null,
      onFailure: s.onFailure ?? 'abort',
      condition: s.condition ?? null,
    });
  }

  // Create task with resolved steps
  const resolvedTask = {
    name: taskDef.name,
    description: taskDef.description,
    version: 1,
    projectId: ctx.projectId,
    libraryId: taskDef.libraryId,
    tags: taskDef.tags,
    inputSchema: taskDef.inputSchema,
    outputSchema: taskDef.outputSchema,
    steps: resolvedSteps,
    retry: taskDef.retry,
    timeoutMs: taskDef.timeoutMs,
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
  if (implementation.promptSpec && isEmbeddedPromptSpec(implementation.promptSpec)) {
    const promptSpecId = await createEmbeddedPromptSpec(
      implementation.promptSpec,
      createdResources,
    );
    implementation.promptSpecId = promptSpecId;
    delete implementation.promptSpec;
  }

  // Resolve embedded model profile if provided
  if (implementation.modelProfile && isEmbeddedModelProfile(implementation.modelProfile)) {
    const mpResponse = await wonder.modelProfiles.create({
      name: implementation.modelProfile.name,
      provider: implementation.modelProfile.provider,
      modelId: implementation.modelProfile.modelId,
      parameters: implementation.modelProfile.parameters,
      executionConfig: implementation.modelProfile.executionConfig,
      costPer1kInputTokens: implementation.modelProfile.costPer1kInputTokens ?? 0,
      costPer1kOutputTokens: implementation.modelProfile.costPer1kOutputTokens ?? 0,
    });
    implementation.modelProfileId = mpResponse.modelProfile.id;
    delete implementation.modelProfile;
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
    autoversion: true,
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
    systemPrompt: promptSpec.systemPrompt,
    template: promptSpec.template,
    requires: promptSpec.requires,
    produces: promptSpec.produces,
    examples: promptSpec.examples,
    tags: promptSpec.tags,
    autoversion: true,
  });

  if (!response?.promptSpecId) {
    throw new Error('Failed to create prompt spec');
  }

  createdResources.promptSpecIds.push(response.promptSpecId);
  return response.promptSpecId;
}
