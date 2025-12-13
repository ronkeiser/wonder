import { node, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { wonder } from '~/client';

/**
 * Represents a resource that can be deleted.
 */
export interface Deletable {
  delete: () => Promise<unknown>;
}

/**
 * Tracks created resources and provides automatic cleanup.
 */
export class ResourceTracker {
  private resources: Deletable[] = [];

  /**
   * Track a resource for cleanup.
   */
  track(resource: Deletable): void {
    this.resources.push(resource);
  }

  /**
   * Clean up all tracked resources in reverse order (LIFO).
   */
  async cleanup(): Promise<void> {
    const count = this.resources.length;
    if (count === 0) {
      return;
    }

    console.log(`✨ Cleaning up ${count} resource${count === 1 ? '' : 's'}...`);

    // Reverse order - delete most recently created resources first
    for (const resource of this.resources.reverse()) {
      try {
        await resource.delete();
      } catch (error) {
        // Silently continue - resource may already be deleted or cascade deleted
        console.warn('Failed to delete resource:', error);
      }
    }
    this.resources = [];

    console.log(`🧹 Cleanup complete!`);
  }

  /**
   * Get the number of tracked resources.
   */
  get count(): number {
    return this.resources.length;
  }
}

/**
 * Create a wonder client wrapper that automatically tracks created resources.
 */
export function createTrackedClient() {
  const tracker = new ResourceTracker();

  // Create a proxy that intercepts resource creation
  const trackedWonder = new Proxy(wonder, {
    get(target, prop) {
      const original = (target as any)[prop];

      // Pass through non-collection properties (like camelCase aliases)
      if (typeof original !== 'function') {
        return original;
      }

      // Wrap collection functions (they are callable AND have methods)
      return new Proxy(original, {
        get(collectionTarget, collectionProp) {
          const collectionMethod = (collectionTarget as any)[collectionProp];

          // Intercept create methods
          if (collectionProp === 'create' && typeof collectionMethod === 'function') {
            return async (...args: any[]) => {
              const result = await collectionMethod.apply(collectionTarget, args);

              // Track the created resource for cleanup
              // Extract ID from response and create deletable
              // Response format: { workspace_id: "...", workspace: { id: "...", ... } }
              const keys = Object.keys(result || {});
              const idKey = keys.find((k) => k.endsWith('_id'));
              const id = idKey ? (result as any)[idKey] : undefined;

              if (id) {
                const deletable = (target as any)[prop as string](id);
                tracker.track(deletable);
              }

              return result;
            };
          }

          return collectionMethod;
        },
        // Also proxy the callable function itself (for calling like wonder.workspaces(id))
        apply(collectionTarget, thisArg, args) {
          return collectionTarget.apply(thisArg, args);
        },
      });
    },
  });

  return { wonder: trackedWonder, tracker };
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
 *
 * @param client - Optional wonder client to use (defaults to global wonder)
 */
export async function setupTestContext(client = wonder): Promise<TestContext> {
  // Create workspace
  const workspaceResponse = await client.workspaces.create({
    name: `Test Workspace ${Date.now()}`,
  });

  if (!workspaceResponse?.workspace) {
    throw new Error('Failed to create workspace');
  }
  const workspaceId = workspaceResponse.workspace.id;

  // Create project
  const projectResponse = await client.projects.create({
    workspace_id: workspaceId,
    name: `Test Project ${Date.now()}`,
    description: 'Test project for workflow tests',
  });

  if (!projectResponse?.project) {
    throw new Error('Failed to create project');
  }
  const projectId = projectResponse.project.id;

  // Create model profile
  const modelProfileResponse = await client.modelProfiles.create({
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
