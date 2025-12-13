import { node, schema, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import {
  cleanupWorkflowTest,
  createWorkflow,
  executeWorkflow,
  setupTestContext,
} from '~/utils/edge-test-helpers';

describe('Coordinator - Simple Workflow Tests', () => {
  /**
   * Tests workflow execution with context state management.
   *
   * This test demonstrates:
   * - Setting up a workflow with input, state (context), and output schemas
   * - Mapping data between workflow context tables and task execution
   * - Writing to the state table during node execution
   * - Verifying state writes via trace events
   *
   * Test flow:
   * 1. Setup: Create base resources (workspace, project, model profile, action, task)
   * 2. Define: Create workflow definition with state schema
   * 3. Execute: Run workflow with input data
   * 4. Verify: Check completion status and state writes
   * 5. Cleanup: Delete all created resources
   */
  it('executes a workflow with context state', async () => {
    /**
     * Create all base resources needed for workflow testing.
     * Returns: workspace, project, model profile, echo action, and echo task IDs
     */
    const ctx = await setupTestContext();

    /**
     * Define the workflow structure.
     *
     * Schemas:
     * - input_schema: Defines what data the workflow accepts from caller
     * - context_schema: Defines internal state stored in 'state' table during execution
     * - output_schema: Defines what data the workflow returns to caller
     *
     * Mappings:
     * - input_mapping: JSONPath expressions that pull data from context → task input
     * - output_mapping (node): JSONPath expressions that store task output → context tables
     * - output_mapping (workflow): JSONPath expressions that map context → final result
     */
    const workflow = workflowDef({
      name: `Stateful Workflow ${Date.now()}`,
      description: 'Workflow with context state',
      project_id: ctx.projectId,

      /** Defines what data the workflow accepts */
      input_schema: schema.object(
        {
          name: schema.string(),
          count: schema.number(),
        },
        { required: ['name', 'count'] },
      ),

      /** Defines internal state that persists during execution (stored in 'state' table) */
      context_schema: schema.object({
        intermediate: schema.string(),
      }),

      /** Defines what data the workflow produces */
      output_schema: schema.object(
        {
          greeting: schema.string(),
          final_count: schema.number(),
        },
        { required: ['greeting', 'final_count'] },
      ),

      /** Maps from workflow-level output table to final result returned to caller */
      output_mapping: {
        greeting: '$.output.greeting',
        final_count: '$.output.processed_count',
      },

      /** Where execution starts */
      initial_node_ref: 'process',

      /** The actual processing units in the workflow */
      nodes: [
        node({
          ref: 'process', // Unique identifier for this node
          name: 'Process',
          task_id: ctx.echoTaskId, // References the task definition to execute
          task_version: 1,

          /** Maps workflow context → task input (JSONPath expressions pull data) */
          input_mapping: {
            name: '$.input.name', // Read from workflow input table
            count: '$.input.count', // Read from workflow input table
          },

          /** Maps task output → workflow context (stores results in context tables) */
          output_mapping: {
            'output.greeting': '$.greeting', // Write to output table
            'output.processed_count': '$.processed_count', // Write to output table
            'state.intermediate': '$.greeting', // Write to state table (context)
          },
        }),
      ],

      /** How workflow moves between nodes (empty = single node workflow) */
      transitions: [],
    });

    /** Create the workflow definition and workflow binding in the system */
    const setup = await createWorkflow(ctx, workflow);

    /** Execute the workflow with input data */
    const result = await executeWorkflow(setup.workflowId, {
      name: 'Charlie',
      count: 123,
    });

    /** Log all workflow events (workflow_started, node_completed, workflow_completed, etc.) */
    console.log('Events:', JSON.stringify(result.events, null, 2));

    /** Workflow should complete successfully */
    expect(result.status).toBe('completed');

    /**
     * Verify that state (context) was written during execution.
     * The trace contains all internal operations that happened.
     */
    const stateWrites = result.trace.context.writes().filter((e) => e.payload.path === 'state');
    expect(stateWrites.length).toBeGreaterThan(0);

    /** Delete all resources created during this test */
    await cleanupWorkflowTest(setup, result.workflowRunId);
  });
});
