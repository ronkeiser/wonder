import { node, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { wonder } from '~/client';

export interface TestContext {
  workspaceId: string;
  projectId: string;
  modelProfileId: string;
  echoPromptId: string;
  echoActionId: string;
  echoTaskId: string;
}

export interface WorkflowTestSetup extends TestContext {
  workflowDefId: string;
  workflowId: string;
}

/**
 * Sets up the base context needed for workflow tests:
 * - Workspace
 * - Project
 * - Model profile
 * - Echo prompt spec and action (for simple testing)
 * - Echo task definition
 */
export async function setupTestContext(): Promise<TestContext> {
  // Create workspace
  const workspaceResponse = await wonder.workspaces.create({
    name: `Test Workspace ${Date.now()}`,
  });

  if (!workspaceResponse?.workspace) {
    throw new Error('Failed to create workspace');
  }
  const workspaceId = workspaceResponse.workspace.id;

  // Create project
  const projectResponse = await wonder.projects.create({
    workspace_id: workspaceId,
    name: `Test Project ${Date.now()}`,
    description: 'Test project for workflow tests',
  });

  if (!projectResponse?.project) {
    throw new Error('Failed to create project');
  }
  const projectId = projectResponse.project.id;

  // Create model profile
  const modelProfileResponse = await wonder['model-profiles'].create({
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

  if (!modelProfileResponse?.model_profile) {
    throw new Error('Failed to create model profile');
  }
  const modelProfileId = modelProfileResponse.model_profile.id;

  // Create echo prompt spec
  const echoPromptResponse = await wonder['prompt-specs'].create({
    version: 1,
    name: 'Echo Input',
    description: 'Echo the input name and count',
    template: 'Return a greeting that says "Hello {{name}}" and count is {{count}}.',
    template_language: 'handlebars',
    requires: {
      name: schema.string(),
      count: schema.number(),
    },
    produces: schema.object(
      {
        greeting: schema.string(),
        processed_count: schema.number(),
      },
      { required: ['greeting', 'processed_count'] },
    ),
  });

  if (!echoPromptResponse?.prompt_spec) {
    throw new Error('Failed to create prompt spec');
  }
  const echoPromptId = echoPromptResponse.prompt_spec.id;

  // Create echo action
  const echoActionResponse = await wonder.actions.create({
    version: 1,
    name: 'Echo Action',
    description: 'LLM action that processes input',
    kind: 'llm_call',
    implementation: {
      prompt_spec_id: echoPromptId,
      model_profile_id: modelProfileId,
    },
  });

  if (!echoActionResponse?.action) {
    throw new Error('Failed to create action');
  }
  const echoActionId = echoActionResponse.action.id;

  // Create echo task definition
  const echoTask = taskDef({
    name: 'Echo Task',
    description: 'Task that wraps the echo action',
    version: 1,
    project_id: projectId,
    input_schema: schema.object(
      {
        name: schema.string(),
        count: schema.number(),
      },
      { required: ['name', 'count'] },
    ),
    output_schema: schema.object(
      {
        greeting: schema.string(),
        processed_count: schema.number(),
      },
      { required: ['greeting', 'processed_count'] },
    ),
    steps: [
      step({
        ref: 'call_echo',
        ordinal: 0,
        action_id: echoActionId,
        action_version: 1,
        input_mapping: {
          name: '$.input.name',
          count: '$.input.count',
        },
        output_mapping: {
          'output.greeting': '$.response.greeting',
          'output.processed_count': '$.response.processed_count',
        },
      }),
    ],
  });

  const taskDefResponse = await wonder['task-defs'].create(echoTask);

  if (!taskDefResponse?.task_def) {
    throw new Error('Failed to create task definition');
  }
  const echoTaskId = taskDefResponse.task_def.id;

  return {
    workspaceId,
    projectId,
    modelProfileId,
    echoPromptId,
    echoActionId,
    echoTaskId,
  };
}

/**
 * Creates a workflow definition and workflow binding from the provided workflow definition.
 */
export async function createWorkflow(
  ctx: TestContext,
  workflow: ReturnType<typeof workflowDef>,
): Promise<WorkflowTestSetup> {
  const workflowDefResponse = await wonder['workflow-defs'].create(workflow);

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
 * Cleans up all resources created during a workflow test.
 */
export async function cleanupWorkflowTest(setup: WorkflowTestSetup, workflowRunId?: string) {
  if (workflowRunId) {
    await wonder['workflow-runs'](workflowRunId).delete();
  }

  await wonder.workflows(setup.workflowId).delete();
  await wonder['workflow-defs'](setup.workflowDefId).delete();
  await wonder['task-defs'](setup.echoTaskId).delete();
  await wonder.actions(setup.echoActionId).delete();
  await wonder['prompt-specs'](setup.echoPromptId).delete();
  await wonder['model-profiles'](setup.modelProfileId).delete();
  await wonder.projects(setup.projectId).delete();
  await wonder.workspaces(setup.workspaceId).delete();
}

/**
 * Cleans up just the base context (without workflow-specific resources).
 * Use this if you created a context but didn't create a workflow.
 */
export async function cleanupTestContext(ctx: TestContext) {
  await wonder['task-defs'](ctx.echoTaskId).delete();
  await wonder.actions(ctx.echoActionId).delete();
  await wonder['prompt-specs'](ctx.echoPromptId).delete();
  await wonder['model-profiles'](ctx.modelProfileId).delete();
  await wonder.projects(ctx.projectId).delete();
  await wonder.workspaces(ctx.workspaceId).delete();
}
