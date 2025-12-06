import { describe, expect, it } from 'vitest';
import { client } from '~/client';
describe('WorkflowDef API', () => {
  it('should create and retrieve a workflow definition with single LLM node', async () => {
    // Create workspace
    const { data: workspaceResponse } = await client.POST('/api/workspaces', {
      body: { name: `Test Workspace ${Date.now()}` },
    });

    // Create project
    const { data: projectResponse } = await client.POST('/api/projects', {
      body: {
        workspace_id: workspaceResponse!.workspace.id,
        name: `Test Project ${Date.now()}`,
        description: 'E2E test project for workflow def',
      },
    });

    // Create action for the LLM node
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        name: `LLM Action ${Date.now()}`,
        description: 'LLM call action for workflow',
        version: 1,
        kind: 'llm_call',
        implementation: {
          model: 'claude-3-5-sonnet-20241022',
          temperature: 0.7,
        },
        requires: {
          input: 'string',
        },
        produces: {
          output: 'string',
        },
      },
    });

    // Create workflow definition with single node
    const { data: createResponse, error: createError } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Simple Workflow ${Date.now()}`,
        description: 'Single LLM node workflow',
        version: 1,
        owner: {
          type: 'project',
          project_id: projectResponse!.project.id,
        },
        input_schema: {
          prompt: 'string',
        },
        output_schema: {
          response: 'string',
        },
        initial_node_ref: 'llm_node_1',
        nodes: [
          {
            ref: 'llm_node_1',
            name: 'LLM Call',
            action_id: actionResponse!.action.id,
            action_version: 1,
            input_mapping: {
              input: '$.prompt',
            },
            output_mapping: {
              response: '$.output',
            },
          },
        ],
      },
    });

    expect(createError).toBeUndefined();
    expect(createResponse).toBeDefined();
    expect(createResponse!.workflow_def_id).toBeDefined();
    expect(createResponse!.workflow_def).toBeDefined();
    expect(createResponse!.workflow_def.id).toBeDefined();
    expect(createResponse!.workflow_def.name).toContain('Simple Workflow');
    expect(createResponse!.workflow_def.initial_node_id).toBeDefined();

    // Get workflow definition
    const { data: getResponse, error: getError } = await client.GET('/api/workflow-defs/{id}', {
      params: { path: { id: createResponse!.workflow_def.id } },
    });

    expect(getError).toBeUndefined();
    expect(getResponse).toBeDefined();
    expect(getResponse!.workflow_def).toBeDefined();
    expect(getResponse!.workflow_def.id).toBe(createResponse!.workflow_def.id);
    expect(getResponse!.workflow_def.name).toBe(createResponse!.workflow_def.name);
    expect(getResponse!.workflow_def.initial_node_id).toBeDefined();

    // Cleanup
    await client.DELETE('/api/actions/{id}', {
      params: { path: { id: actionResponse!.action.id } },
    });
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
