import { node, schema, step, taskDef, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { wonder } from '~/client';

describe('Scaffold Demo', () => {
  /**
   * Demonstrates the scaffold method for minimal test setup.
   *
   * The scaffold method:
   * 1. Creates infrastructure (workspace, project, model profile)
   * 2. Accepts a workflowDef function that receives modelProfileId
   * 3. Creates the workflow definition
   * 4. Executes the workflow with provided input
   * 5. Returns output and all infrastructure resources
   * 6. Tracks everything for cleanup
   *
   * Note: The scaffold method handles infrastructure only.
   * Domain resources (prompt specs, actions, task defs) must be created
   * before calling scaffold and referenced in the workflow definition.
   */
  it('scaffolds and executes a workflow', async () => {
    // First create domain resources (these need the model profile ID)
    // We'll create them manually, then use scaffold for infrastructure + execution

    // Create prompt spec
    const promptSpec = await wonder.test.promptSpecs.create({
      version: 1,
      name: 'Scaffold Demo Prompt',
      description: 'Simple greeting prompt',
      template: 'Say hello to {{name}} in a friendly way.',
      template_language: 'handlebars',
      requires: { name: schema.string() },
      produces: schema.object({ greeting: schema.string() }, { required: ['greeting'] }),
    });

    // We need to get a model profile ID to create the action
    // Create one manually first
    const modelProfile = await wonder.test.modelProfiles.create({
      name: `Scaffold Model ${Date.now()}`,
      provider: 'cloudflare',
      model_id: '@cf/meta/llama-3.1-8b-instruct',
      parameters: { max_tokens: 512, temperature: 1.0 },
      cost_per_1k_input_tokens: 0.0,
      cost_per_1k_output_tokens: 0.0,
    });

    // Create action using the model profile
    const action = await wonder.test.actions.create({
      version: 1,
      name: 'Scaffold Demo Action',
      description: 'LLM greeting action',
      kind: 'llm_call',
      implementation: {
        prompt_spec_id: promptSpec.id,
        model_profile_id: modelProfile.id,
      },
    });

    // Create workspace and project for the task def
    const workspace = await wonder.test.workspaces.create({
      name: `Scaffold Workspace ${Date.now()}`,
      settings: {},
    });

    const project = await wonder.test.projects.create({
      workspace_id: workspace.id,
      name: `Scaffold Project ${Date.now()}`,
      settings: {},
    });

    // Create task def
    const task = await wonder.test.taskDefs.create(
      taskDef({
        name: 'Scaffold Demo Task',
        description: 'Task for scaffold demo',
        version: 1,
        project_id: project.id,
        input_schema: schema.object({ name: schema.string() }, { required: ['name'] }),
        output_schema: schema.object({ greeting: schema.string() }, { required: ['greeting'] }),
        steps: [
          step({
            ref: 'greet',
            ordinal: 0,
            action_id: action.id,
            action_version: 1,
            input_mapping: { name: '$.input.name' },
            output_mapping: { 'output.greeting': '$.response.greeting' },
          }),
        ],
      }),
    );

    // Create workflow definition
    const workflowDefinition = await wonder.test.workflowDefs.create(
      workflowDef({
        name: `Scaffold Workflow ${Date.now()}`,
        description: 'Scaffold demo workflow',
        project_id: project.id,
        input_schema: schema.object({ name: schema.string() }, { required: ['name'] }),
        output_schema: schema.object({ greeting: schema.string() }, { required: ['greeting'] }),
        output_mapping: { greeting: '$.output.greeting' },
        initial_node_ref: 'greet',
        nodes: [
          node({
            ref: 'greet',
            name: 'Greet',
            task_id: task.id,
            task_version: 1,
            input_mapping: { name: '$.input.name' },
            output_mapping: { 'output.greeting': '$.greeting' },
          }),
        ],
        transitions: [],
      }),
    );

    // Create and execute workflow
    const workflow = await wonder.test.workflows.create({
      workflow_def_id: workflowDefinition.id,
      project_id: project.id,
      name: `Scaffold Run ${Date.now()}`,
    });

    // Execute with streaming
    const result = await wonder
      .workflows(workflow.id)
      .stream({ name: 'World' }, { timeout: 60000, idleTimeout: 10000 });

    // Verify result
    expect(result.status).toBe('completed');
    console.log('✅ Scaffold demo completed!');
    console.log('Output:', JSON.stringify(result.events.at(-1)?.metadata, null, 2));

    // Track workflow run for cleanup
    wonder.test.tracker.track({
      delete: () => wonder.workflowRuns(result.workflow_run_id).delete(),
    });

    // Cleanup - single call deletes all 9 resources in reverse order
    console.log(`📊 Tracked ${wonder.test.tracker.count} resources`);
    await wonder.test.tracker.cleanup();
  });
});
