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
          provider: 'cloudflare',
          model_id: '@cf/meta/llama-3.1-8b-instruct',
          parameters: {
            max_tokens: 512,
            temperature: 0.7,
          },
          cost_per_1k_input_tokens: 0.0,
          cost_per_1k_output_tokens: 0.0,
        },
      },
    );

    expect(modelProfileError).toBeUndefined();

    // Create prompt spec (before action since action references it)
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

    // Create action (after prompt spec since action references it)
    const actionId = `test-action-${Date.now()}`;
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        id: actionId,
        version: 1,
        name: 'Test LLM Action',
        description: 'LLM action for workflow execution test',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: promptSpecResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create workflow definition with single LLM node
    const { data: workflowDefResponse, error: wfDefError } = await client.POST(
      '/api/workflow-defs',
      {
        body: {
          name: `Test Workflow Def ${Date.now()}`,
          description: 'Workflow definition for execution test',
          version: 1,
          owner: {
            type: 'project' as const,
            project_id: projectResponse!.project.id,
          },
          input_schema: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
            },
            required: ['prompt'],
          },
          output_schema: {
            type: 'object',
            properties: {
              response: { type: 'string' },
            },
          },
          initial_node_id: 'node-1',
          nodes: [
            {
              id: 'node-1',
              name: 'LLM Node',
              action_id: actionResponse!.action.id,
              action_version: 1,
              input_mapping: {
                prompt: '$.input.prompt',
              },
              output_mapping: {
                response: '$.response',
              },
            },
          ],
        },
      },
    );

    expect(wfDefError).toBeUndefined();

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

    // Connect to WebSocket to listen for workflow completion
    const wsUrl = `wss://wonder-http.ron-keiser.workers.dev/api/coordinator/${
      startResponse!.durable_object_id
    }/stream`;
    const ws = new WebSocket(wsUrl);

    const workflowOutput = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Workflow did not complete within 10 seconds'));
      }, 10000);

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('WebSocket event:', JSON.stringify(message, null, 2));

        if (message.kind === 'workflow_completed') {
          clearTimeout(timeout);
          ws.close();
          const output =
            message.payload?.full_context?.output?.response ||
            message.metadata?.output?.response ||
            message.payload?.output?.response;
          if (output) {
            resolve(output);
          } else {
            reject(
              new Error(`No response in workflow_completed event: ${JSON.stringify(message)}`),
            );
          }
        }
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        reject(error);
      };
    });

    // Verify we got output
    expect(workflowOutput).toBeDefined();
    console.log('\n🤖 Model output:', workflowOutput);

    // Cleanup
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
