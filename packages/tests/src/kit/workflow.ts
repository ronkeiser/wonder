/**
 * Workflow Creation and Execution
 *
 * Functions for creating, configuring, and executing test workflows.
 */

import {
  isEmbeddedTask,
  type EmbeddedNode,
  type EmbeddedWorkflowDef,
  type EventEntry,
  type TraceEventEntry,
} from '@wonder/sdk';
import { TraceEventCollection } from './trace';
import { wonder } from '~/client';
import { cleanupWorkflowTest } from './cleanup';
import { setupTestContext } from './context';
import { createEmbeddedTask } from './resources';
import type {
  CreatedResources,
  ExecuteWorkflowResult,
  TestContext,
  TestWorkflowResult,
  WorkflowTestSetup,
} from './types';

export type { ExecuteWorkflowResult, TestWorkflowResult, WorkflowTestSetup } from './types';

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_IDLE_TIMEOUT_MS = 30000; // 30 seconds

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
      if (task && isEmbeddedTask(task)) {
        const taskId = await createEmbeddedTask(ctx, task, createdResources);
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
 * Executes a workflow using SSE streaming via the generated SDK method.
 *
 * Uses wonder.workflows(id).start() which returns an async generator of SSE events.
 * Extracts workflowRunId from the first workflow.started event.
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
): Promise<ExecuteWorkflowResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS;

  const events: EventEntry[] = [];
  const traceEvents: TraceEventEntry[] = [];
  let workflowRunId: string | null = null;
  let status: ExecuteWorkflowResult['status'] = 'timeout';

  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeout) {
      idleTimer = setTimeout(() => {
        status = 'idle_timeout';
        timedOut = true;
      }, idleTimeout);
    }
  };

  // Set up total timeout
  if (timeout) {
    totalTimer = setTimeout(() => {
      timedOut = true;
    }, timeout);
  }

  resetIdleTimer();

  try {
    // Use the generated SDK method - returns AsyncGenerator<WorkflowSSEEvent>
    const stream = wonder.workflows(workflowId).start({
      stream: true,
      input: inputData as Record<string, unknown>,
    });

    for await (const sseEvent of stream) {
      if (timedOut) break;

      resetIdleTimer();

      // Collect events by stream type
      if (sseEvent.stream === 'trace') {
        const traceEvent = sseEvent.event as TraceEventEntry;
        traceEvents.push(traceEvent);

        if (options?.logEvents) {
          console.log(`🔍 ${traceEvent.type}`, JSON.stringify(traceEvent.payload ?? {}, null, 2));
        }
      } else {
        const event = sseEvent.event as EventEntry;
        events.push(event);

        if (options?.logEvents) {
          console.log(`📨 ${event.eventType}`, event.metadata);
        }

        // Extract workflowRunId from workflow.started event
        // executionId contains the workflowRunId for workflow events
        if (event.eventType === 'workflow.started') {
          workflowRunId = event.executionId;
        }

        // Check for terminal conditions
        if (event.eventType === 'workflow.completed') {
          status = 'completed';
          break;
        }
        if (event.eventType === 'workflow.failed') {
          status = 'failed';
          break;
        }
      }
    }
  } finally {
    if (totalTimer) clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }

  if (!workflowRunId) {
    throw new Error('Never received workflowRunId from workflow.started event');
  }

  return {
    workflowRunId,
    status,
    events,
    traceEvents,
    trace: new TraceEventCollection(traceEvents),
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
    `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events?streamId=${result.workflowRunId}"`,
  );
  console.log('   # Trace events (coordinator decisions, routing, sync):');
  console.log(
    `   curl -H "X-API-Key: ${apiKey}" "https://api.wflow.app/events/trace?streamId=${result.workflowRunId}"`,
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