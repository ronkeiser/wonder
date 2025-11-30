import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Workflow (Binding) API', () => {
  it('should create and retrieve a workflow binding', async () => {
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
        description: 'Test project for workflow binding',
      },
    });

    // Create action
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Test LLM Action',
        description: 'LLM action for workflow binding test',
        kind: 'llm_call',
        implementation: {
          model: 'gpt-4',
        },
      },
    });

    // Create workflow definition
    const { data: workflowDefResponse } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Test Workflow Def ${Date.now()}`,
        description: 'Workflow definition for binding test',
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
        initial_node_ref: 'node_1',
        nodes: [
          {
            ref: 'node_1',
            name: 'LLM Node',
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

    // Create workflow binding
    const { data: createResponse, error: createError } = await client.POST('/api/workflows', {
      body: {
        project_id: projectResponse!.project.id,
        workflow_def_id: workflowDefResponse!.workflow_def.id,
        name: `Test Workflow ${Date.now()}`,
        description: 'Workflow binding instance',
      },
    });

    expect(createError).toBeUndefined();
    expect(createResponse).toBeDefined();
    expect(createResponse!.workflow_id).toBeDefined();
    expect(createResponse!.workflow).toBeDefined();
    expect(createResponse!.workflow.id).toBeDefined();
    expect(createResponse!.workflow.project_id).toBe(projectResponse!.project.id);
    expect(createResponse!.workflow.workflow_def_id).toBe(workflowDefResponse!.workflow_def.id);
    expect(createResponse!.workflow.name).toContain('Test Workflow');

    // Get workflow binding
    const { data: getResponse, error: getError } = await client.GET('/api/workflows/{id}', {
      params: { path: { id: createResponse!.workflow.id } },
    });

    expect(getError).toBeUndefined();
    expect(getResponse).toBeDefined();
    expect(getResponse!.workflow).toBeDefined();
    expect(getResponse!.workflow.id).toBe(createResponse!.workflow.id);
    expect(getResponse!.workflow.project_id).toBe(projectResponse!.project.id);
    expect(getResponse!.workflow.workflow_def_id).toBe(workflowDefResponse!.workflow_def.id);

    // Cleanup
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
