import { node, schema, step, taskDef, workflowDef } from '@wonder/sdk';
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
}

/**
 * Sets up the base infrastructure needed for workflow tests:
 * - Workspace
 * - Project
 * - Model profile
 *
 * Tests should create their own prompt specs, actions, and task definitions.
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
 * Creates a workflow definition and workflow binding from the provided workflow definition.
 */
export async function createWorkflow(
  ctx: TestContext,
  workflow: ReturnType<typeof workflowDef>,
): Promise<WorkflowTestSetup> {
  const workflowDefResponse = await wonder.workflowDefs.create(workflow);

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
  };
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
 * @deprecated Use cleanup() instead for more flexibility
 */
export async function cleanupWorkflowTest(
  setup: WorkflowTestSetup,
  workflowRunId?: string,
  taskDefId?: string,
  actionId?: string,
  promptSpecId?: string,
) {
  if (workflowRunId) {
    await wonder['workflow-runs'](workflowRunId).delete();
  }

  await wonder.workflows(setup.workflowId).delete();
  await wonder['workflow-defs'](setup.workflowDefId).delete();

  if (taskDefId) {
    await wonder['task-defs'](taskDefId).delete();
  }

  if (actionId) {
    await wonder.actions(actionId).delete();
  }

  if (promptSpecId) {
    await wonder['prompt-specs'](promptSpecId).delete();
  }

  await wonder['model-profiles'](setup.modelProfileId).delete();
  await wonder.projects(setup.projectId).delete();
  await wonder.workspaces(setup.workspaceId).delete();
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
