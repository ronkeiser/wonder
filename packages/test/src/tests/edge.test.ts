import { node, schema, workflowDef } from '@wonder/sdk';
import { describe, expect, it } from 'vitest';
import { wonder } from '~/client';

describe('Edge Test - Hello World', () => {
  it('single hello world node', async () => {
    // Step 1: Create workspace
    const workspaceResponse = await wonder.workspaces.create({
      name: `Test Workspace ${Date.now()}`,
    });

    expect(workspaceResponse).toBeDefined();
    expect(workspaceResponse?.workspace).toBeDefined();
    expect(workspaceResponse?.workspace.id).toBeDefined();

    const workspaceId = workspaceResponse!.workspace.id;
    console.log('✓ Workspace created:', workspaceId);

    // Step 2: Create project
    const projectResponse = await wonder.projects.create({
      workspace_id: workspaceId,
      name: `Test Project ${Date.now()}`,
      description: 'Test project for hello world',
    });

    expect(projectResponse).toBeDefined();
    expect(projectResponse?.project).toBeDefined();
    expect(projectResponse?.project.id).toBeDefined();
    expect(projectResponse?.project.workspace_id).toBe(workspaceId);

    const projectId = projectResponse!.project.id;
    console.log('✓ Project created:', projectId);

    // Step 3: Create model profile
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

    expect(modelProfileResponse).toBeDefined();
    expect(modelProfileResponse?.model_profile).toBeDefined();
    expect(modelProfileResponse?.model_profile.id).toBeDefined();

    const modelProfileId = modelProfileResponse!.model_profile.id;
    console.log('✓ Model profile created:', modelProfileId);

    // Step 4: Create hello world prompt spec
    const helloPromptResponse = await wonder['prompt-specs'].create({
      version: 1,
      name: 'Hello World',
      description: 'Simple hello world prompt',
      template: 'Say "Hello, World!" and nothing else.',
      template_language: 'handlebars',
      requires: {},
      produces: schema.object(
        {
          message: schema.string(),
        },
        { required: ['message'] },
      ),
    });

    expect(helloPromptResponse).toBeDefined();
    expect(helloPromptResponse?.prompt_spec.id).toBeDefined();

    const helloPromptId = helloPromptResponse!.prompt_spec.id;
    console.log('✓ Hello world prompt spec created:', helloPromptId);

    // Step 5: Create hello world action
    const helloActionResponse = await wonder.actions.create({
      version: 1,
      name: 'Hello World Action',
      description: 'LLM action for hello world',
      kind: 'llm_call',
      implementation: {
        prompt_spec_id: helloPromptId,
        model_profile_id: modelProfileId,
      },
    });

    expect(helloActionResponse).toBeDefined();
    expect(helloActionResponse?.action.id).toBeDefined();

    const helloActionId = helloActionResponse!.action.id;
    console.log('✓ Hello world action created:', helloActionId);

    // Step 6: Create workflow definition with single node
    const workflow = workflowDef({
      name: `Hello World Workflow ${Date.now()}`,
      description: 'Simple hello world workflow',
      project_id: projectId,
      input_schema: schema.object({}),
      output_schema: schema.object(
        {
          message: schema.string(),
        },
        { required: ['message'] },
      ),
      output_mapping: {
        message: '$.hello_node_output.message',
      },
      initial_node_ref: 'hello_node',
      nodes: [
        node({
          ref: 'hello_node',
          name: 'Hello World',
          action_id: helloActionId,
          action_version: 1,
          input_mapping: {},
          output_mapping: {
            message: '$.response.message',
          },
        }),
      ],
      transitions: [],
    });

    const workflowDefResponse = await wonder['workflow-defs'].create(workflow);

    if (!workflowDefResponse) {
      throw new Error('Failed to create workflow def');
    }

    expect(workflowDefResponse).toBeDefined();
    expect(workflowDefResponse.workflow_def_id).toBeDefined();
    expect(workflowDefResponse.workflow_def.initial_node_id).toBeDefined();

    const workflowDefId = workflowDefResponse.workflow_def_id;
    console.log('✓ Workflow def created:', workflowDefId);
    console.log('  Initial node ID:', workflowDefResponse.workflow_def.initial_node_id);

    // Step 7: Create workflow (binds workflow_def to project)
    const workflowResponse = await wonder.workflows.create({
      project_id: projectId,
      workflow_def_id: workflowDefId,
      name: `Hello World Workflow ${Date.now()}`,
      description: 'Simple hello world workflow execution',
    });

    expect(workflowResponse).toBeDefined();
    expect(workflowResponse?.workflow).toBeDefined();
    expect(workflowResponse?.workflow.id).toBeDefined();

    const workflowId = workflowResponse!.workflow.id;
    console.log('✓ Workflow created:', workflowId);

    // Step 8: Execute workflow with streaming
    const result = await wonder.workflows(workflowId).stream(
      {},
      {
        timeout: 60000,
        idleTimeout: 10000,
      },
    );

    expect(result).toBeDefined();
    const workflowRunId = result.workflow_run_id;
    console.log('✓ Workflow run ID:', workflowRunId);

    // Debug execution if workflow didn't complete
    if (result.status !== 'completed') {
      console.log('\n⚠️  Workflow did not complete.');
      console.log('Workflow events:', JSON.stringify(result.events, null, 2));
      console.log('Trace events:', JSON.stringify(result.traceEvents, null, 2));
    }

    expect(result.status).toBe('completed');
    expect(result.events.length).toBeGreaterThan(0);

    // Validate workflow events (business logic)
    const workflowEvents = result.events.filter((e) => e.event_type === 'workflow_started');
    expect(workflowEvents.length).toBe(1);
    console.log('  ✓ workflow_started event present');

    const nodeEvents = result.events.filter((e) => e.event_type === 'node_completed');
    expect(nodeEvents.length).toBe(1);
    console.log('  ✓ node_completed event present');

    const completedEvents = result.events.filter((e) => e.event_type === 'workflow_completed');
    expect(completedEvents.length).toBe(1);
    console.log('  ✓ workflow_completed event present');

    // Validate trace events (internal execution) - use ergonomic trace helpers
    const trace = result.trace;

    const contextInit = trace.context.initialize();
    expect(contextInit).toBeDefined();
    expect(contextInit!.payload.table_count).toBeGreaterThan(0);
    console.log(
      `  ✓ operation.context.initialize trace (${contextInit!.payload.table_count} tables)`,
    );

    const contextWrite = trace.context.writeAt('input');
    expect(contextWrite).toBeDefined();
    expect(contextWrite!.payload.path).toBe('input');
    console.log('  ✓ operation.context.write trace (input stored)');

    const tokenCreates = trace.tokens.creates();
    expect(tokenCreates.length).toBeGreaterThan(0);
    expect(tokenCreates[0].payload.token_id).toBeDefined();
    // For Chunk 1, coordinator uses hardcoded 'node_start', not the actual node ID from workflow def
    expect(tokenCreates[0].payload.node_id).toBe('node_start');
    console.log(`  ✓ operation.tokens.create trace (token: ${tokenCreates[0].payload.token_id})`);

    const tokenStatusUpdates = trace.tokens.statusUpdates();
    expect(tokenStatusUpdates.length).toBeGreaterThanOrEqual(2); // pending→executing, executing→completed
    console.log(`  ✓ operation.tokens.update_status traces (${tokenStatusUpdates.length} updates)`);

    // Validate token status transitions
    const statusChanges = tokenStatusUpdates.map((e) => `${e.payload.from}→${e.payload.to}`);
    console.log(`    Status transitions: ${statusChanges.join(', ')}`);

    console.log('\n✅ Chunk 1 validation complete: minimal execution loop working');

    // Step 9: Clean up resources
    console.log('\n🧹 Cleaning up resources...');

    // Delete workflow (workflow binding)
    await wonder.workflows(workflowId).delete();
    console.log('  ✓ Deleted workflow:', workflowId);

    // Delete workflow definition
    await wonder['workflow-defs'](workflowDefId).delete();
    console.log('  ✓ Deleted workflow def:', workflowDefId);

    // Delete action
    await wonder.actions(helloActionId).delete();
    console.log('  ✓ Deleted action:', helloActionId);

    // Delete prompt spec
    await wonder['prompt-specs'](helloPromptId).delete();
    console.log('  ✓ Deleted prompt spec:', helloPromptId);

    // Delete model profile
    await wonder['model-profiles'](modelProfileId).delete();
    console.log('  ✓ Deleted model profile:', modelProfileId);

    // Delete project
    await wonder.projects(projectId).delete();
    console.log('  ✓ Deleted project:', projectId);

    // Delete workspace
    await wonder.workspaces(workspaceId).delete();
    console.log('  ✓ Deleted workspace:', workspaceId);

    console.log('✅ Cleanup complete');
  });
});
