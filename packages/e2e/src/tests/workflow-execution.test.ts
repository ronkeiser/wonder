import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Workflow Execution API', () => {
  it('should start a workflow execution and return workflow_run_id', async () => {
    // Create workspace
    const { data: workspaceResponse } = await client.POST('/api/workspaces', {
      body: {
        name: `Test Workspace ${Date.now()}`,
      },
    });

    // Create project
    const { data: projectResponse } = await client.POST('/api/projects', {
      body: {
        workspace_id: workspaceResponse!.workspace.id,
        name: `Test Project ${Date.now()}`,
        description: 'Test project for workflow execution',
      },
    });

    // Create model profile
    const { data: modelProfileResponse, error: modelProfileError } = await client.POST(
      '/api/model-profiles',
      {
        body: {
          name: `Test Model Profile ${Date.now()}`,
          provider: 'anthropic',
          model_id: 'claude-3-5-sonnet-20241022',
          parameters: {
            max_tokens: 4096,
            temperature: 0.7,
          },
          cost_per_1k_input_tokens: 0.003,
          cost_per_1k_output_tokens: 0.015,
        },
      },
    );

    expect(modelProfileError).toBeUndefined();

    // Create action
    const actionId = `test-action-${Date.now()}`;
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        id: actionId,
        version: 1,
        name: 'Test LLM Action',
        description: 'LLM action for workflow execution test',
        kind: 'llm_call',
        implementation: {
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create prompt spec
    const promptSpecId = `test-prompt-${Date.now()}`;
    const { data: promptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        id: promptSpecId,
        version: 1,
        name: 'Test Prompt',
        description: 'Prompt for workflow execution test',
        template: 'You are a helpful assistant. User prompt: {{prompt}}',
        template_language: 'handlebars',
        requires: {
          prompt: 'string',
        },
        produces: {
          response: 'string',
        },
      },
    });

    // Create workflow definition with single LLM node
    const { data: workflowDefResponse } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Test Workflow Def ${Date.now()}`,
        description: 'Workflow definition for execution test',
        version: 1,
        owner: {
          type: 'project' as const,
          project_id: projectResponse!.project.id,
        },
        input_schema: {
          prompt: 'string',
        },
        output_schema: {
          response: 'string',
        },
        initial_node_id: 'node-1',
        nodes: [
          {
            id: 'node-1',
            name: 'LLM Node',
            action_id: actionResponse!.action.id,
            action_version: 1,
            input_mapping: {
              prompt: '$.prompt',
            },
            output_mapping: {
              response: '$.output',
            },
          },
        ],
      },
    });

    // Create workflow binding
    const { data: workflowResponse } = await client.POST('/api/workflows', {
      body: {
        project_id: projectResponse!.project.id,
        workflow_def_id: workflowDefResponse!.workflow_def.id,
        name: `Test Workflow ${Date.now()}`,
        description: 'Workflow for execution test',
      },
    });

    // Start workflow execution
    const { data: startResponse, error: startError } = await client.POST(
      '/api/workflows/{id}/start',
      {
        params: { path: { id: workflowResponse!.workflow.id } },
        body: {
          prompt: 'Hello, world!',
        },
      },
    );

    if (startError) {
      console.error('Workflow start error:', JSON.stringify(startError, null, 2));
    }
    expect(startError).toBeUndefined();
    expect(startResponse).toBeDefined();
    expect(startResponse!.workflow_run_id).toBeDefined();
    expect(startResponse!.durable_object_id).toBeDefined();

    // Verify workflow_run_id is a valid ULID format
    expect(startResponse!.workflow_run_id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

    // Cleanup
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
