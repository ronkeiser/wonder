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
import type { CreatedResources, TestContext, TestWorkflowResult, WorkflowTestSetup } from './types';

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
 *                 promptSpec: promptSpec({...}),
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
  options?: { name?: string },
): Promise<WorkflowTestSetup> {
  const createdResources: CreatedResources = {
    promptSpecIds: [],
    actionIds: [],
    taskIds: [],
  };

  // Process nodes - resolve embedded task defs to IDs, pass everything else through
  const resolvedNodes = await Promise.all(
    (workflow.nodes as EmbeddedNode[]).map(async (n) => {
      const { task, ...rest } = n;

      // Subworkflow node or node with existing taskId - pass through
      if (n.subworkflowId || n.taskId) {
        return rest;
      }

      // Embedded task def - create it and get the ID
      if (task && isEmbeddedTaskDef(task)) {
        const taskId = await createEmbeddedTaskDef(ctx, task, createdResources);
        return { ...rest, taskId };
      }

      throw new Error(`Node ${n.ref} must have either taskId/task or subworkflowId`);
    }),
  );

  // Create workflow def with resolved nodes
  const resolvedWorkflow = {
    ...workflow,
    projectId: ctx.projectId,
    nodes: resolvedNodes,
  };

  const workflowDefResponse = await wonder.workflowDefs.create(resolvedWorkflow as any);

  if (!workflowDefResponse?.workflowDefId) {
    throw new Error('Failed to create workflow definition');
  }
  const workflowDefId = workflowDefResponse.workflowDefId;
  const version = workflowDefResponse.workflowDef?.version ?? 1;

  console.log(`📦 Created workflow def (version ${version})`);

  const workflowResponse = await wonder.workflows.create({
    projectId: ctx.projectId,
    workflowDefId: workflowDefId,
    name: options?.name ?? workflow.name,
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
    /** Enable trace event emission for this workflow run */
    enableTraceEvents?: boolean;
  },
) {
  const result = await wonder.workflows(workflowId).stream(inputData, {
    timeout: options?.timeout ?? 60000,
    idleTimeout: options?.idleTimeout ?? 10000,
    enableTraceEvents: options?.enableTraceEvents,
    onEvent: options?.logEvents
      ? (event) => {
          if ('eventType' in event) {
            console.log(`📨 ${event.eventType}`, JSON.stringify(event.metadata ?? {}, null, 2));
          } else if ('type' in event) {
            console.log(`🔍 ${event.type}`, JSON.stringify(event.payload ?? {}, null, 2));
          }
        }
      : undefined,
  });

  return {
    workflowRunId: result.workflowRunId,
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
 *                   promptSpec: promptSpec({...}),
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
    /** Override workflow name (useful for identifying test runs) */
    name?: string;
    timeout?: number;
    idleTimeout?: number;
    /** Log events to console as they arrive */
    logEvents?: boolean;
    /** Enable trace event emission for this workflow run */
    enableTraceEvents?: boolean;
  },
): Promise<TestWorkflowResult> {
  // Setup infrastructure
  console.log('🔧 Setting up test project...');
  const ctx = await setupTestContext();

  // Create workflow and all embedded resources
  const setup = await createWorkflow(ctx, workflow, { name: options?.name });

  // Execute the workflow
  console.log('🚀 Starting workflow execution...');
  const result = await executeWorkflow(setup.workflowId, input, options);

  // Output workflow run ID for debugging queries
  const apiKey = process.env.API_KEY ?? '$API_KEY';
  console.log('\n📋 Workflow Run Info:');
  console.log(`   workflowRunId: ${result.workflowRunId}`);
  console.log(`   status: ${result.status}`);
  console.log('\n🔍 Debug Query Examples:');
  console.log('   # Events (workflow/task/token lifecycle, LLM calls):');
  console.log(
    `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events?workflowRunId=${result.workflowRunId}"`,
  );
  console.log('   # Trace events (coordinator decisions, routing, sync):');
  console.log(
    `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events/trace?workflowRunId=${result.workflowRunId}"`,
  );
  console.log('\n🎁  Response is wrapped: { "events": [...] }');
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
