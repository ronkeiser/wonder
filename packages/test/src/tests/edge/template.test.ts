import { action, node, promptSpec, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { runTestWorkflow } from '~/utils/edge-test-helpers';

describe('Coordinator - Simple Workflow Tests', () => {
  /**
   * Tests workflow execution with context state management.
   *
   * This test demonstrates:
   * - Using embedded builders: promptSpec → action → step → taskDef → node → workflowDef
   * - Setting up a workflow with input, state (context), and output schemas
   * - Mapping data between workflow context tables and task execution
   * - Writing to the state table during node execution
   * - Verifying state writes via trace events
   *
   * runTestWorkflow handles all scaffolding and cleanup automatically.
   */
  it('executes a workflow with context state', async () => {
    const { result, cleanup } = await runTestWorkflow(
      workflowDef({
        name: `Stateful Workflow ${Date.now()}`,
        description: 'Workflow with context state',

        input_schema: schema.object(
          { name: schema.string(), count: schema.number() },
          { required: ['name', 'count'] },
        ),

        // Internal state that persists during execution (stored in 'state' table)
        context_schema: schema.object({
          intermediate: schema.string(),
        }),

        output_schema: schema.object(
          { greeting: schema.string(), final_count: schema.number() },
          { required: ['greeting', 'final_count'] },
        ),

        output_mapping: {
          greeting: '$.output.greeting',
          final_count: '$.output.processed_count',
        },

        initial_node_ref: 'process',

        nodes: [
          node({
            ref: 'process',
            name: 'Process',
            task: taskDef({
              name: 'Echo Task',
              description: 'Task that wraps the echo action',
              input_schema: schema.object(
                { name: schema.string(), count: schema.number() },
                { required: ['name', 'count'] },
              ),
              output_schema: schema.object(
                { greeting: schema.string(), processed_count: schema.number() },
                { required: ['greeting', 'processed_count'] },
              ),
              steps: [
                step({
                  ref: 'call_echo',
                  ordinal: 0,
                  action: action({
                    name: 'Echo Action',
                    description: 'LLM action that processes input',
                    kind: 'llm_call',
                    implementation: {
                      prompt_spec: promptSpec({
                        name: 'Echo Input',
                        description: 'Echo the input name and count',
                        template:
                          'Enthusiasticly greet a person named {{name}}. Tell them that the count is {{count}}.',
                        template_language: 'handlebars',
                        requires: { name: schema.string(), count: schema.number() },
                        produces: schema.object(
                          { greeting: schema.string(), processed_count: schema.number() },
                          { required: ['greeting', 'processed_count'] },
                        ),
                      }),
                    },
                  }),
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
            task_version: 1,
            input_mapping: {
              name: '$.input.name',
              count: '$.input.count',
            },
            output_mapping: {
              'output.greeting': '$.greeting',
              'output.processed_count': '$.processed_count',
              'state.intermediate': '$.greeting',
            },
          }),
        ],

        transitions: [],
      }),
      { name: 'Charlie', count: 123 },
      { logEvents: false },
    );

    expect(result.status).toBe('completed');

    // Verify state was written during execution
    const stateWrites = result.trace.context.writesTo('state');
    expect(stateWrites.length).toBeGreaterThan(0);

    await cleanup();
  });
});
