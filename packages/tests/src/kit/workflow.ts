/**
 * Workflow Creation and Execution
 *
 * Functions for creating, configuring, and executing test workflows.
 */

import { isEmbeddedTaskDef, type EmbeddedNode, type EmbeddedWorkflowDef } from '@wonder/sdk';
import { wonder } from '~/client';
import { cleanupWorkflowTest } from './cleanup';
import { setupTestContext } from './context';
import { createEmbeddedTaskDef } from './resources';
import type {
  CreatedResources,
  TestContext,
  TestWorkflowResult,
  WorkflowTestSetup,
} from './types';

export type { TestWorkflowResult, WorkflowTestSetup } from './types';

/**
 * Creates all embedded resources and the workflow.
 *
 * Walks the workflow definition tree, finds embedded objects (promptSpec, action, task),
 * creates them in dependency order, and wires up the IDs.
 *
 * @example
 * const wf = workflow({
 *   nodes: [
 *     node({
 *       task: task({
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
  const createdResources: CreatedResources = {
    promptSpecIds: [],
    actionIds: [],
    taskDefIds: [],
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
 * Executes a workflow and returns all events.
 */
export async function executeWorkflow(
  workflowId: string,
  inputData: unknown,
  options?: {
    timeout?: number;
    idleTimeout?: number;
    /** Log events to console as they arrive */
    logEvents?: boolean;
  },
) {
  const result = await wonder.workflows(workflowId).stream(inputData, {
    timeout: options?.timeout ?? 60000,
    idleTimeout: options?.idleTimeout ?? 10000,
    onEvent: options?.logEvents
      ? (event) => {
          if ('event_type' in event) {
            console.log(`📨 ${event.event_type}`, JSON.stringify(event.metadata ?? {}, null, 2));
          } else if ('type' in event) {
            console.log(`🔍 ${event.type}`, JSON.stringify(event.payload ?? {}, null, 2));
          }
        }
      : undefined,
  });

  return {
    workflowRunId: result.workflow_run_id,
    status: result.status,
    events: result.events,
    trace: result.trace,
  };
}

/**
 * All-in-one helper to scaffold, run, and cleanup a test workflow.
 *
 * This is the simplest way to test a workflow:
 * 1. Creates workspace, project, model profile
 * 2. Creates all embedded resources (promptSpec → action → task)
 * 3. Creates and executes the workflow
 * 4. Returns results and a cleanup function
 *
 * @example
 * const { result, cleanup } = await runTestWorkflow(
 *   workflow({
 *     name: 'My Test Workflow',
 *     nodes: [
 *       node({
 *         task: task({
 *           steps: [
 *             step({
 *               action: action({
 *                 implementation: {
 *                   prompt_spec: promptSpec({...}),
 *                 }
 *               }),
 *             })
 *           ]
 *         })
 *       })
 *     ]
 *   }),
 *   { input: 'data' }
 * );
 *
 * expect(result.status).toBe('completed');
 * await cleanup();
 */
export async function runTestWorkflow(
  workflow: EmbeddedWorkflowDef,
  input: unknown,
  options?: {
    timeout?: number;
    idleTimeout?: number;
    /** Log events to console as they arrive */
    logEvents?: boolean;
  },
): Promise<TestWorkflowResult> {
  // Setup infrastructure
  console.log('🔧 Setting up test project...');
  const ctx = await setupTestContext();

  // Create workflow and all embedded resources
  const setup = await createWorkflow(ctx, workflow);

  // Execute the workflow
  console.log('🚀 Starting workflow execution...');
  const result = await executeWorkflow(setup.workflowId, input, options);

  // Output workflow run ID for debugging queries
  console.log('\n📋 Workflow Run Info:');
  console.log(`   workflow_run_id: ${result.workflowRunId}`);
  console.log(`   status: ${result.status}`);
  console.log('\n🔍 Debug Query Examples:');
  console.log('   # Events (workflow/task/token lifecycle, LLM calls):');
  console.log(
    `   curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/events?workflow_run_id=${result.workflowRunId}"`,
  );
  console.log('   # Trace events (coordinator decisions, routing, sync):');
  console.log(
    `   curl -H "X-API-Key: $API_KEY" "https://api.wflow.app/events/trace?workflow_run_id=${result.workflowRunId}"`,
  );
  console.log('\n⚠️  Response is wrapped: { "events": [...] }');
  console.log("   Use jq to unwrap: curl ... | jq '.events'");
  console.log('');

  // Return results with cleanup function
  return {
    result,
    setup,
    cleanup: async () => {
      console.log('🧹 Starting cleanup...');
      const count = await cleanupWorkflowTest(setup, result.workflowRunId);
      console.log(`✨ Cleanup complete (${count} resources)`);
    },
  };
}
