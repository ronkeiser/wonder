import { node, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { testClient, wonder } from '~/client';

describe('Test Client Demo', () => {
  /**
   * Demonstrates the test client's auto-unwrapping and auto-tracking features.
   *
   * Key differences from standard client:
   * - create() returns unwrapped resources (not { resource_id, resource })
   * - All created resources are automatically tracked for cleanup
   * - Single cleanup() call deletes all in reverse order
   *
   * This test creates the same workflow as template.test.ts but with
   * significantly less boilerplate.
   */
  it('executes a workflow with auto-tracking', async () => {
    // Create infrastructure - resources are auto-unwrapped and auto-tracked
    const workspace = await testClient.workspaces.create({
      name: `Test Workspace ${Date.now()}`,
      settings: {},
    });

    const project = await testClient.projects.create({
      workspace_id: workspace.id,
      name: `Test Project ${Date.now()}`,
      settings: {},
    });

    const modelProfile = await testClient.modelProfiles.create({
      name: `Test Model ${Date.now()}`,
      provider: 'cloudflare',
      model_id: '@cf/meta/llama-3.1-8b-instruct',
      parameters: {
        max_tokens: 512,
        temperature: 1.0,
      },
      cost_per_1k_input_tokens: 0.0,
      cost_per_1k_output_tokens: 0.0,
    });

    // Create domain resources - also auto-unwrapped and tracked
    const promptSpec = await testClient.promptSpecs.create({
      version: 1,
      name: 'Echo Input',
      description: 'Echo the input name and count',
      template: 'Greet {{name}} and tell them the count is {{count}}.',
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

    const action = await testClient.actions.create({
      version: 1,
      name: 'Echo Action',
      description: 'LLM action that processes input',
      kind: 'llm_call',
      implementation: {
        prompt_spec_id: promptSpec.id,
        model_profile_id: modelProfile.id,
      },
    });

    const task = await testClient.taskDefs.create(
      taskDef({
        name: 'Echo Task',
        description: 'Task that wraps the echo action',
        version: 1,
        project_id: project.id,
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
            action_id: action.id,
            action_version: 1,
            input_mapping: { name: '$.input.name', count: '$.input.count' },
            output_mapping: {
              'output.greeting': '$.response.greeting',
              'output.processed_count': '$.response.processed_count',
            },
          }),
        ],
      }),
    );

    const workflowDefinition = await testClient.workflowDefs.create(
      workflowDef({
        name: `Test Workflow ${Date.now()}`,
        description: 'Workflow demonstrating test client',
        project_id: project.id,
        input_schema: schema.object(
          { name: schema.string(), count: schema.number() },
          { required: ['name', 'count'] },
        ),
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
            task_id: task.id,
            task_version: 1,
            input_mapping: { name: '$.input.name', count: '$.input.count' },
            output_mapping: {
              'output.greeting': '$.greeting',
              'output.processed_count': '$.processed_count',
              'state.intermediate': '$.greeting',
            },
          }),
        ],
        transitions: [],
      }),
    );

    const workflow = await testClient.workflows.create({
      workflow_def_id: workflowDefinition.id,
      project_id: project.id,
      name: `Test Workflow Run ${Date.now()}`,
    });

    // Use the streaming API for execution (handles polling internally)
    const result = await wonder
      .workflows(workflow.id)
      .stream({ name: 'Alice', count: 42 }, { timeout: 60000, idleTimeout: 10000 });

    expect(result.status).toBe('completed');
    console.log('Workflow output:', result.events);

    // Count tracked resources
    console.log(`📊 Tracked ${testClient.tracker.count} resources for cleanup`);

    // Track the workflow run for cleanup too
    testClient.tracker.track({
      delete: () => wonder.workflowRuns(result.workflow_run_id).delete(),
    });

    // Single cleanup call - all resources deleted in reverse order (LIFO)
    await testClient.tracker.cleanup();
  });
});
