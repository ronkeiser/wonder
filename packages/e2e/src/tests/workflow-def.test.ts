import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('WorkflowDef API', () => {
  it('should create and retrieve a workflow definition with single LLM node', async () => {
    // Create workspace
    const { data: workspace } = await client.POST('/api/workspaces', {
      body: { name: `Test Workspace ${Date.now()}` },
    });

    // Create project
    const { data: project } = await client.POST('/api/projects', {
      body: {
        workspace_id: workspace!.id,
        name: `Test Project ${Date.now()}`,
        description: 'E2E test project for workflow def',
      },
    });

    // Create action for the LLM node
    const actionId = `llm-action-${Date.now()}`;
    const { data: action } = await client.POST('/api/actions', {
      body: {
        id: actionId,
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
    const { data: workflowDef, error: createError } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Simple Workflow ${Date.now()}`,
        description: 'Single LLM node workflow',
        version: 1,
        owner: {
          type: 'project',
          project_id: project!.id,
        },
        input_schema: {
          prompt: 'string',
        },
        output_schema: {
          response: 'string',
        },
        initial_node_id: 'llm-node-1',
        nodes: [
          {
            id: 'llm-node-1',
            name: 'LLM Call',
            action_id: action!.id,
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
    expect(workflowDef).toBeDefined();
    expect(workflowDef!.id).toBeDefined();
    expect(workflowDef!.name).toContain('Simple Workflow');
    expect(workflowDef!.initial_node_id).toBe('llm-node-1');

    // Get workflow definition
    const { data: retrieved, error: getError } = await client.GET('/api/workflow-defs/{id}', {
      params: { path: { id: workflowDef!.id } },
    });

    expect(getError).toBeUndefined();
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(workflowDef!.id);
    expect(retrieved!.name).toBe(workflowDef!.name);
    expect(retrieved!.initial_node_id).toBe('llm-node-1');

    // Cleanup
    await client.DELETE('/api/actions/{id}', {
      params: { path: { id: action!.id } },
    });
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: project!.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspace!.id } },
    });
  });
});
