import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Edge Workflow - Single Node JSON Output', () => {
  it('should create a madlib template with JSON output', async () => {
    const testTopic = 'a pirate adventure';

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
        description: 'Test project for JSON output',
      },
    });

    // Create model profile
    const { data: modelProfileResponse } = await client.POST('/api/model-profiles', {
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
    });

    // Create prompt spec for madlib generation
    const { data: promptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Generate Madlib Template',
        description: 'Generates a madlib template with placeholders as JSON',
        template:
          'Create a short madlib story (2-3 sentences) about {{topic}}. Use placeholders like [adjective], [noun], [verb], [adverb], [animal], [color]. Respond with ONLY valid JSON, no markdown formatting, no explanation. Use this exact format: {"template": "The [adjective] [animal] [verb] down the [color] path.", "placeholders": ["adjective", "animal", "verb", "color"]}',
        template_language: 'handlebars',
        requires: {
          topic: 'string',
        },
        produces: {
          template: 'string',
          placeholders: 'array',
        },
      },
    });

    // Create action
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Generate Madlib Action',
        description: 'LLM action to generate madlib template',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: promptSpecResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create workflow definition with single node
    const { data: workflowDefResponse } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Single Node Madlib Workflow ${Date.now()}`,
        description: 'Single node workflow that generates madlib JSON',
        version: 1,
        owner: {
          type: 'project' as const,
          project_id: projectResponse!.project.id,
        },
        input_schema: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
          },
          required: ['topic'],
        },
        output_schema: {
          type: 'object',
          properties: {
            template: { type: 'string' },
            placeholders: { type: 'array' },
          },
        },
        output_mapping: {
          template: '$.generate_output.template',
          placeholders: '$.generate_output.placeholders',
        },
        initial_node_ref: 'generate',
        nodes: [
          {
            ref: 'generate',
            name: 'Generate Madlib Template',
            action_id: actionResponse!.action.id,
            action_version: 1,
            input_mapping: {
              topic: '$.input.topic',
            },
            output_mapping: {
              template: '$.response',
              placeholders: '$.response',
            },
          },
        ],
        transitions: [],
      },
    });

    // Create workflow binding
    const { data: workflowResponse } = await client.POST('/api/workflows', {
      body: {
        project_id: projectResponse!.project.id,
        workflow_def_id: workflowDefResponse!.workflow_def.id,
        name: `Test Workflow ${Date.now()}`,
        description: 'Single node test workflow',
      },
    });

    // Start workflow execution
    const { data: startResponse, error: startError } = await client.POST(
      '/api/workflows/{id}/start',
      {
        params: { path: { id: workflowResponse!.workflow.id } },
        body: {
          topic: testTopic,
        },
      },
    );

    expect(startError).toBeUndefined();
    expect(startResponse).toBeDefined();
    expect(startResponse!.workflow_run_id).toBeDefined();
    expect(startResponse!.workflow_run_id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

    console.log('\n✅ Workflow started successfully');
    console.log(`   Workflow Run ID: ${startResponse!.workflow_run_id}`);
    console.log(`   Check logs for JSON output`);

    // Cleanup
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
