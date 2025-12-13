import { node, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { wonder } from '~/client';
import {
  cleanup,
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
   * - Automatic resource cleanup with tracked client
   *
   * Test flow:
   * 1. Setup: Create tracked client and base infrastructure
   * 2. Define: Create prompt spec, action, task, and workflow
   * 3. Execute: Run workflow with input data
   * 4. Verify: Check completion status and state writes
   * 5. Cleanup: Automatically delete all created resources
   */
  it('executes a workflow with context state', async () => {
    /** Create base infrastructure (workspace, project, model profile) */
    const ctx = await setupTestContext();

    /** Create prompt spec that echoes input */
    const promptSpecResponse = await wonder.promptSpecs.create({
      version: 1,
      name: 'Echo Input',
      description: 'Echo the input name and count',
      template:
        'Enthusiasticly greet a person named {{name}}. Tell them that the count is {{count}}.',
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

    /** Create LLM action using the prompt spec */
    const actionResponse = await wonder.actions.create({
      version: 1,
      name: 'Echo Action',
      description: 'LLM action that processes input',
      kind: 'llm_call',
      implementation: {
        prompt_spec_id: promptSpecResponse.prompt_spec.id,
        model_profile_id: ctx.modelProfileId,
      },
    });

    /** Create task definition that wraps the echo action */
    const taskDefResponse = await wonder.taskDefs.create(
      taskDef({
        name: 'Echo Task',
        description: 'Task that wraps the echo action',
        version: 1,
        project_id: ctx.projectId,
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
            action_id: actionResponse.action.id,
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
      }),
    );

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
          ref: 'process',
          name: 'Process',
          task_id: taskDefResponse.task_def.id,
          task_version: 1,

          /** Maps workflow context → task input (JSONPath expressions pull data) */
          input_mapping: {
            name: '$.input.name',
            count: '$.input.count',
          },

          /** Maps task output → workflow context (stores results in context tables) */
          output_mapping: {
            'output.greeting': '$.greeting',
            'output.processed_count': '$.processed_count',
            'state.intermediate': '$.greeting',
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

    /**
     * Cleanup all resources in reverse order of creation.
     * This ensures referential integrity - child resources deleted before parents.
     */
    await cleanup(
      wonder.workflowRuns(result.workflowRunId),
      wonder.workflows(setup.workflowId),
      wonder.workflowDefs(setup.workflowDefId),
      wonder.taskDefs(taskDefResponse.task_def.id),
      wonder.actions(actionResponse.action.id),
      wonder.promptSpecs(promptSpecResponse.prompt_spec.id),
      wonder.modelProfiles(ctx.modelProfileId),
      wonder.projects(ctx.projectId),
      wonder.workspaces(ctx.workspaceId),
    );
  });
});
