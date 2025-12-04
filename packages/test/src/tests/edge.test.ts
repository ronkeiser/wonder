import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Edge Test - Hello World', () => {
  it('should execute a simple hello world workflow', async () => {
    // Create workspace
    const { data: workspaceResponse } = await client.POST('/api/workspaces', {
      body: {
        name: `Test Workspace ${Date.now()}`,
      },
    });

    expect(workspaceResponse).toBeDefined();
    const workspaceId = workspaceResponse!.workspace.id;

    // Create project
    const { data: projectResponse } = await client.POST('/api/projects', {
      body: {
        workspace_id: workspaceId,
        name: `Test Project ${Date.now()}`,
        description: 'Test project for hello world workflow',
      },
    });

    expect(projectResponse).toBeDefined();
    const projectId = projectResponse!.project.id;

    // Create model profile
    const { data: modelProfileResponse } = await client.POST('/api/model-profiles', {
      body: {
        name: `Test Model Profile ${Date.now()}`,
        provider: 'cloudflare',
        model_id: '@cf/meta/llama-3.1-8b-instruct',
        parameters: {
          max_tokens: 128,
          temperature: 0.7,
        },
        cost_per_1k_input_tokens: 0.0,
        cost_per_1k_output_tokens: 0.0,
      },
    });

    expect(modelProfileResponse).toBeDefined();
    const modelProfileId = modelProfileResponse!.model_profile.id;

    // Create prompt spec
    const { data: promptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Hello World Prompt',
        description: 'Simple hello world prompt',
        template: 'Say hello to {{name}} in a friendly way.',
        template_language: 'handlebars',
        requires: {
          name: 'string',
        },
        produces: {
          greeting: 'string',
        },
      },
    });

    expect(promptSpecResponse).toBeDefined();
    const promptSpecId = promptSpecResponse!.prompt_spec.id;

    // Create action
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Hello World Action',
        description: 'LLM action for hello world',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: promptSpecId,
          model_profile_id: modelProfileId,
        },
      },
    });

    expect(actionResponse).toBeDefined();
    const actionId = actionResponse!.action.id;

    // Create workflow definition with single node
    const { data: workflowDefResponse } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Hello World Workflow ${Date.now()}`,
        description: 'Single node hello world workflow',
        version: 1,
        owner: {
          type: 'project' as const,
          project_id: projectId,
        },
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
        output_schema: {
          type: 'object',
          properties: {
            greeting: { type: 'string' },
          },
          required: ['greeting'],
        },
        output_mapping: {
          greeting: '$.hello_node_output.greeting',
        },
        initial_node_ref: 'hello_node',
        nodes: [
          {
            ref: 'hello_node',
            name: 'Hello World Node',
            action_id: actionId,
            action_version: 1,
            input_mapping: {
              name: '$.input.name',
            },
            output_mapping: {
              greeting: '$.greeting',
            },
            fan_out: 'first_match' as const,
            fan_in: 'any' as const,
          },
        ],
        transitions: [],
      },
    });

    expect(workflowDefResponse).toBeDefined();
    expect(workflowDefResponse!.workflow_def_id).toBeDefined();
    expect(workflowDefResponse!.workflow_def.initial_node_id).toBeDefined();

    console.log('Hello World Workflow created successfully:');
    console.log('- Workspace ID:', workspaceId);
    console.log('- Project ID:', projectId);
    console.log('- Workflow Def ID:', workflowDefResponse!.workflow_def_id);
    console.log('- Initial Node ID:', workflowDefResponse!.workflow_def.initial_node_id);
  });
});
