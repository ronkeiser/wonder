import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Edge Test - Branching Architecture', () => {
  it('fan-out with spawn_count=3', async () => {
    // Step 1: Create workspace
    const { data: workspaceResponse } = await client.POST('/api/workspaces', {
      body: {
        name: `Test Workspace ${Date.now()}`,
      },
    });

    expect(workspaceResponse).toBeDefined();
    expect(workspaceResponse!.workspace).toBeDefined();
    expect(workspaceResponse!.workspace.id).toBeDefined();

    const workspaceId = workspaceResponse!.workspace.id;
    console.log('✓ Workspace created:', workspaceId);

    // Step 2: Create project
    const { data: projectResponse } = await client.POST('/api/projects', {
      body: {
        workspace_id: workspaceId,
        name: `Test Project ${Date.now()}`,
        description: 'Test project for branching architecture',
      },
    });

    expect(projectResponse).toBeDefined();
    expect(projectResponse!.project).toBeDefined();
    expect(projectResponse!.project.id).toBeDefined();
    expect(projectResponse!.project.workspace_id).toBe(workspaceId);

    const projectId = projectResponse!.project.id;
    console.log('✓ Project created:', projectId);

    // Step 3: Create model profile
    const { data: modelProfileResponse } = await client.POST('/api/model-profiles', {
      body: {
        name: `Test Model Profile ${Date.now()}`,
        provider: 'cloudflare',
        model_id: '@cf/meta/llama-3.1-8b-instruct',
        parameters: {
          max_tokens: 128,
          temperature: 1.2,
        },
        cost_per_1k_input_tokens: 0.0,
        cost_per_1k_output_tokens: 0.0,
      },
    });

    expect(modelProfileResponse).toBeDefined();
    expect(modelProfileResponse!.model_profile).toBeDefined();
    expect(modelProfileResponse!.model_profile.id).toBeDefined();

    const modelProfileId = modelProfileResponse!.model_profile.id;
    console.log('✓ Model profile created:', modelProfileId);

    // Step 4: Create prompt spec
    const { data: promptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Dog Name Ideation',
        description: 'Generate creative dog name ideas',
        template:
          'Suggest a creative and unique name for my dog. Just respond with the name, nothing else.',
        template_language: 'handlebars',
        requires: {},
        produces: {
          name: 'string',
        },
      },
    });

    expect(promptSpecResponse).toBeDefined();
    expect(promptSpecResponse!.prompt_spec).toBeDefined();
    expect(promptSpecResponse!.prompt_spec.id).toBeDefined();

    const promptSpecId = promptSpecResponse!.prompt_spec.id;
    console.log('✓ Prompt spec created:', promptSpecId);

    // Step 5: Create action
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Ideation Action',
        description: 'LLM action for generating ideas',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: promptSpecId,
          model_profile_id: modelProfileId,
        },
      },
    });

    expect(actionResponse).toBeDefined();
    expect(actionResponse!.action).toBeDefined();
    expect(actionResponse!.action.id).toBeDefined();

    const actionId = actionResponse!.action.id;
    console.log('✓ Action created:', actionId);

    // Step 6: Create workflow definition with fan-out
    const { data: workflowDefResponse, error: workflowDefError } = await client.POST(
      '/api/workflow-defs',
      {
        body: {
          name: `Dog Name Ideation Workflow ${Date.now()}`,
          description: 'Tests spawn_count=3 fan-out for dog name ideas',
          version: 1,
          project_id: projectId,
          input_schema: {
            type: 'object',
            properties: {},
          },
          output_schema: {
            type: 'object',
            properties: {
              names: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['names'],
          },
          output_mapping: {
            names: '$.terminal_node_output.merged_names',
          },
          initial_node_ref: 'start_node',
          nodes: [
            {
              ref: 'start_node',
              name: 'Start',
              action_id: actionId,
              action_version: 1,
              input_mapping: {},
              output_mapping: {
                name: '$.response.name',
              },
            },
            {
              ref: 'ideation_node',
              name: 'Dog Name Ideation',
              action_id: actionId,
              action_version: 1,
              input_mapping: {},
              output_mapping: {
                name: '$.response.name',
              },
            },
            {
              ref: 'terminal_node',
              name: 'Terminal',
              action_id: actionId,
              action_version: 1,
              input_mapping: {},
              output_mapping: {
                name: '$.response.name',
              },
            },
          ],
          transitions: [
            {
              ref: 'start_to_ideation',
              from_node_ref: 'start_node',
              to_node_ref: 'ideation_node',
              priority: 1,
              spawn_count: 3,
            },
            {
              ref: 'ideation_to_terminal',
              from_node_ref: 'ideation_node',
              to_node_ref: 'terminal_node',
              priority: 1,
              synchronization: {
                wait_for: 'all',
                joins_transition: 'start_to_ideation',
                merge: {
                  source: '*.name',
                  target: '$.terminal_node_output.merged_names',
                  strategy: 'array',
                },
              },
            },
          ],
        },
      },
    );

    expect(workflowDefResponse).toBeDefined();
    expect(workflowDefResponse!.workflow_def_id).toBeDefined();
    expect(workflowDefResponse!.workflow_def.initial_node_id).toBeDefined();

    const workflowDefId = workflowDefResponse!.workflow_def_id;
    console.log('✓ Workflow def created:', workflowDefId);
    console.log('  Initial node ID:', workflowDefResponse!.workflow_def.initial_node_id);

    // Step 7: Create workflow (binds workflow_def to project)
    const { data: workflowResponse, error: workflowError } = await client.POST('/api/workflows', {
      body: {
        project_id: projectId,
        workflow_def_id: workflowDefId,
        name: `Fan-Out Test Workflow ${Date.now()}`,
        description: 'Tests spawn_count=3 fan-out with proper path_id',
      },
    });

    expect(workflowError).toBeUndefined();
    expect(workflowResponse).toBeDefined();
    expect(workflowResponse!.workflow).toBeDefined();
    expect(workflowResponse!.workflow.id).toBeDefined();

    const workflowId = workflowResponse!.workflow.id;
    console.log('✓ Workflow created:', workflowId);

    // Step 8: Start workflow execution
    const { data: startResponse, error: startError } = await client.POST(
      '/api/workflows/{id}/start',
      {
        params: { path: { id: workflowId } },
        body: {},
      },
    );

    expect(startError).toBeUndefined();
    expect(startResponse).toBeDefined();
    expect(startResponse!.workflow_run_id).toBeDefined();

    console.log('✓ Workflow started:', startResponse!.workflow_run_id);
    console.log('');
    console.log('Expected behavior:');
    console.log('  1. Initial token executes start_node (path_id=root)');
    console.log('  2. Start node completes → transition with spawn_count=3 triggers');
    console.log('  3. Three tokens spawned to ideation_node:');
    console.log('     - path_id=root.ideation_node.0, branch_index=0, branch_total=3');
    console.log('     - path_id=root.ideation_node.1, branch_index=1, branch_total=3');
    console.log('     - path_id=root.ideation_node.2, branch_index=2, branch_total=3');
    console.log('  4. All share fan_out_transition_id (sibling group)');
    console.log('  5. As each ideation token completes:');
    console.log('     - Checks synchronization condition (wait_for=all)');
    console.log('     - First two tokens enter waiting_for_siblings state');
    console.log('     - Third token triggers merge: extracts *.name from branches');
    console.log('     - Stores ["Name1", "Name2", "Name3"] at $.terminal_node_output.merged_names');
    console.log('     - Creates single token for terminal_node');
    console.log('  6. Terminal token completes, workflow finishes');
    console.log('  7. Final output: {names: ["Name1", "Name2", "Name3"]}');
    console.log('');
    console.log('Check logs with:');
    console.log(
      `  curl "https://wonder-logs.ron-keiser.workers.dev/logs?trace_id=${startResponse!.workflow_run_id}&limit=50"`,
    );

    // Cleanup: Delete in reverse order of creation
    // await client.DELETE('/api/workflows/{id}', {
    //   params: { path: { id: workflowId } },
    // });
    // console.log('✓ Workflow deleted');

    // await client.DELETE('/api/workflow-defs/{id}', {
    //   params: { path: { id: workflowDefId } },
    // });
    // console.log('✓ Workflow def deleted');

    // await client.DELETE('/api/actions/{id}', {
    //   params: { path: { id: actionId } },
    // });
    // console.log('✓ Action deleted');
    // await client.DELETE('/api/prompt-specs/{id}', {
    //   params: { path: { id: promptSpecId } },
    // });
    // console.log('✓ Prompt spec deleted');

    // await client.DELETE('/api/model-profiles/{id}', {
    //   params: { path: { id: modelProfileId } },
    // });
    // console.log('✓ Model profile deleted');

    // await client.DELETE('/api/projects/{id}', {
    //   params: { path: { id: projectId } },
    // });
    // console.log('✓ Project deleted');

    // await client.DELETE('/api/workspaces/{id}', {
    //   params: { path: { id: workspaceId } },
    // });
    // console.log('✓ Workspace deleted');
  });
});
