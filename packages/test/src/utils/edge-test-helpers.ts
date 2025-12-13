import {
  isEmbeddedAction,
  isEmbeddedModelProfile,
  isEmbeddedPromptSpec,
  isEmbeddedTaskDef,
  type EmbeddedAction,
  type EmbeddedNode,
  type EmbeddedPromptSpec,
  type EmbeddedStep,
  type EmbeddedTaskDef,
  type EmbeddedWorkflowDef,
} from '@wonder/sdk';
import { wonder } from '~/client';

export interface Deletable {
  delete: () => Promise<unknown>;
}

export interface TestContext {
  workspaceId: string;
  projectId: string;
  modelProfileId: string;
}

export interface WorkflowTestSetup extends TestContext {
  workflowDefId: string;
  workflowId: string;
  /** IDs of all created resources for cleanup (in creation order) */
  createdResources: {
    promptSpecIds: string[];
    actionIds: string[];
    taskDefIds: string[];
  };
}

/**
 * Sets up the base infrastructure needed for workflow tests:
 * - Workspace
 * - Project
 * - Model profile
 *
 * Tests should create their own prompt specs, actions, and task definitions
 * using builders, which will be auto-created by createWorkflow.
 */
export async function setupTestContext(): Promise<TestContext> {
  // Create workspace
  const workspaceResponse = await wonder.workspaces.create({
    name: `Test Workspace ${Date.now()}`,
  });
  const workspaceId = workspaceResponse.workspace.id;

  // Create project
  const projectResponse = await wonder.projects.create({
    workspace_id: workspaceId,
    name: `Test Project ${Date.now()}`,
    description: 'Test project for workflow tests',
  });
  const projectId = projectResponse.project.id;

  // Create model profile
  const modelProfileResponse = await wonder.modelProfiles.create({
    name: `Test Model Profile ${Date.now()}`,
    provider: 'cloudflare',
    model_id: '@cf/meta/llama-3.1-8b-instruct',
    parameters: {
      max_tokens: 512,
      temperature: 1.0,
    },
    cost_per_1k_input_tokens: 0.0,
    cost_per_1k_output_tokens: 0.0,
  });
  const modelProfileId = modelProfileResponse.model_profile.id;

  return {
    workspaceId,
    projectId,
    modelProfileId,
  };
}

/**
 * Creates all embedded resources and the workflow.
 *
 * Walks the workflow definition tree, finds embedded objects (promptSpec, action, taskDef),
 * creates them in dependency order, and wires up the IDs.
 *
 * @example
 * const workflow = workflowDef({
 *   nodes: [
 *     node({
 *       task: taskDef({
 *         steps: [
 *           step({
 *             action: action({
 *               implementation: {
 *                 prompt_spec: promptSpec({...}),
 *               }
 *             }),
 *           })
 *         ]
 *       })
 *     })
 *   ]
 * });
 *
 * const setup = await createWorkflow(ctx, workflow);
 */
export async function createWorkflow(
  ctx: TestContext,
  workflow: EmbeddedWorkflowDef,
): Promise<WorkflowTestSetup> {
  const createdResources = {
    promptSpecIds: [] as string[],
    actionIds: [] as string[],
    taskDefIds: [] as string[],
  };

  // Process nodes to resolve embedded resources
  const resolvedNodes: Array<{
    ref: string;
    name: string;
    task_id: string;
    task_version?: number;
    input_mapping?: Record<string, unknown>;
    output_mapping?: Record<string, unknown>;
    resource_bindings?: Record<string, unknown>;
  }> = [];

  for (const n of workflow.nodes as EmbeddedNode[]) {
    let taskId: string;

    if (n.task_id) {
      // Already has an ID
      taskId = n.task_id;
    } else if (n.task && isEmbeddedTaskDef(n.task)) {
      // Embedded task def - need to create it and its dependencies
      taskId = await createEmbeddedTaskDef(ctx, n.task, createdResources);
    } else {
      throw new Error(`Node ${n.ref} must have either task_id or task`);
    }

    resolvedNodes.push({
      ref: n.ref,
      name: n.name,
      task_id: taskId,
      task_version: n.task_version,
      input_mapping: n.input_mapping,
      output_mapping: n.output_mapping,
      resource_bindings: n.resource_bindings as Record<string, string> | undefined,
    });
  }

  // Create workflow def with resolved nodes
  const resolvedWorkflow = {
    ...workflow,
    project_id: ctx.projectId,
    nodes: resolvedNodes,
  };

  const workflowDefResponse = await wonder.workflowDefs.create(resolvedWorkflow as any);

  if (!workflowDefResponse?.workflow_def_id) {
    throw new Error('Failed to create workflow definition');
  }
  const workflowDefId = workflowDefResponse.workflow_def_id;

  const workflowResponse = await wonder.workflows.create({
    project_id: ctx.projectId,
    workflow_def_id: workflowDefId,
    name: workflow.name,
    description: workflow.description || 'Test workflow',
  });

  if (!workflowResponse?.workflow) {
    throw new Error('Failed to create workflow');
  }
  const workflowId = workflowResponse.workflow.id;

  return {
    ...ctx,
    workflowDefId,
    workflowId,
    createdResources,
  };
}

/**
 * Creates an embedded task def and all its dependencies (actions, prompt specs).
 */
async function createEmbeddedTaskDef(
  ctx: TestContext,
  taskDef: EmbeddedTaskDef,
  createdResources: WorkflowTestSetup['createdResources'],
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

    if (s.action_id) {
      actionId = s.action_id;
    } else if (s.action && isEmbeddedAction(s.action)) {
      actionId = await createEmbeddedAction(ctx, s.action, createdResources);
    } else {
      throw new Error(`Step ${s.ref} must have either action_id or action`);
    }

    resolvedSteps.push({
      ref: s.ref,
      ordinal: s.ordinal,
      action_id: actionId,
      action_version: s.action_version,
      input_mapping: s.input_mapping ?? null,
      output_mapping: s.output_mapping ?? null,
      on_failure: s.on_failure ?? 'abort',
      condition: s.condition ?? null,
    });
  }

  // Create task def with resolved steps
  const resolvedTaskDef = {
    name: taskDef.name,
    description: taskDef.description,
    version: taskDef.version ?? 1,
    project_id: ctx.projectId,
    library_id: taskDef.library_id,
    tags: taskDef.tags,
    input_schema: taskDef.input_schema,
    output_schema: taskDef.output_schema,
    steps: resolvedSteps,
    retry: taskDef.retry,
    timeout_ms: taskDef.timeout_ms,
  };

  const response = await wonder.taskDefs.create(resolvedTaskDef as any);
  if (!response?.task_def?.id) {
    throw new Error('Failed to create task def');
  }

  createdResources.taskDefIds.push(response.task_def.id);
  return response.task_def.id;
}

/**
 * Creates an embedded action and its dependencies (prompt specs, model profiles).
 */
async function createEmbeddedAction(
  ctx: TestContext,
  action: EmbeddedAction,
  createdResources: WorkflowTestSetup['createdResources'],
): Promise<string> {
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

  // Resolve embedded model profile or use context's model profile
  if (implementation.model_profile && isEmbeddedModelProfile(implementation.model_profile)) {
    // Create new model profile
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
  } else if (!implementation.model_profile_id) {
    // Use context's model profile as default
    implementation.model_profile_id = ctx.modelProfileId;
  }

  // Create action
  const response = await wonder.actions.create({
    name: action.name,
    description: action.description,
    version: action.version ?? 1,
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
  return response.action.id;
}

/**
 * Creates an embedded prompt spec.
 */
async function createEmbeddedPromptSpec(
  promptSpec: EmbeddedPromptSpec,
  createdResources: WorkflowTestSetup['createdResources'],
): Promise<string> {
  const response = await wonder.promptSpecs.create({
    name: promptSpec.name,
    description: promptSpec.description,
    version: promptSpec.version ?? 1,
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

/**
 * Executes a workflow and returns all events.
 */
export async function executeWorkflow(
  workflowId: string,
  inputData: unknown,
  options?: {
    timeout?: number;
    idleTimeout?: number;
  },
) {
  const result = await wonder.workflows(workflowId).stream(inputData, {
    timeout: options?.timeout ?? 60000,
    idleTimeout: options?.idleTimeout ?? 10000,
  });

  return {
    workflowRunId: result.workflow_run_id,
    status: result.status,
    events: result.events,
    trace: result.trace,
  };
}

/**
 * Cleans up resources in reverse order (LIFO).
 * Silently continues if a delete fails.
 */
export async function cleanup(...resources: (Deletable | undefined | null)[]) {
  // Reverse order - delete most recently created resources first
  for (const resource of resources.reverse()) {
    if (resource) {
      try {
        await resource.delete();
      } catch (error) {
        // Silently continue - resource may already be deleted or cascade deleted
        console.warn('Failed to delete resource:', error);
      }
    }
  }
}

/**
 * Cleans up all resources created during a workflow test.
 * Handles both legacy explicit IDs and new createdResources tracking.
 */
export async function cleanupWorkflowTest(
  setup: WorkflowTestSetup,
  workflowRunId?: string,
  taskDefId?: string,
  actionId?: string,
  promptSpecId?: string,
) {
  // Delete workflow run
  if (workflowRunId) {
    try {
      await wonder['workflow-runs'](workflowRunId).delete();
    } catch (e) {
      console.warn('Failed to delete workflow run:', e);
    }
  }

  // Delete workflow
  try {
    await wonder.workflows(setup.workflowId).delete();
  } catch (e) {
    console.warn('Failed to delete workflow:', e);
  }

  // Delete workflow def
  try {
    await wonder['workflow-defs'](setup.workflowDefId).delete();
  } catch (e) {
    console.warn('Failed to delete workflow def:', e);
  }

  // Delete task defs (reverse order for any dependencies)
  const taskDefIds = [...(setup.createdResources?.taskDefIds || [])];
  if (taskDefId) taskDefIds.push(taskDefId);
  for (const id of taskDefIds.reverse()) {
    try {
      await wonder['task-defs'](id).delete();
    } catch (e) {
      console.warn('Failed to delete task def:', e);
    }
  }

  // Delete actions
  const actionIds = [...(setup.createdResources?.actionIds || [])];
  if (actionId) actionIds.push(actionId);
  for (const id of actionIds.reverse()) {
    try {
      await wonder.actions(id).delete();
    } catch (e) {
      console.warn('Failed to delete action:', e);
    }
  }

  // Delete prompt specs
  const promptSpecIds = [...(setup.createdResources?.promptSpecIds || [])];
  if (promptSpecId) promptSpecIds.push(promptSpecId);
  for (const id of promptSpecIds.reverse()) {
    try {
      await wonder['prompt-specs'](id).delete();
    } catch (e) {
      console.warn('Failed to delete prompt spec:', e);
    }
  }

  // Delete model profile, project, workspace
  try {
    await wonder['model-profiles'](setup.modelProfileId).delete();
  } catch (e) {
    console.warn('Failed to delete model profile:', e);
  }

  try {
    await wonder.projects(setup.projectId).delete();
  } catch (e) {
    console.warn('Failed to delete project:', e);
  }

  try {
    await wonder.workspaces(setup.workspaceId).delete();
  } catch (e) {
    console.warn('Failed to delete workspace:', e);
  }
}

/**
 * Cleans up just the base context (without workflow-specific resources).
 * Use this if you created a context but didn't create a workflow.
 */
export async function cleanupTestContext(ctx: TestContext) {
  await wonder['model-profiles'](ctx.modelProfileId).delete();
  await wonder.projects(ctx.projectId).delete();
  await wonder.workspaces(ctx.workspaceId).delete();
}
