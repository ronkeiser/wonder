import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Two-Node Workflow Execution', () => {
  it('should execute a two-node madlib workflow', async () => {
    const testTheme = 'a day at the beach';

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
        description: 'Test project for two-node workflow',
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

    // Create prompt spec for madlib creation
    const { data: premisePromptResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Madlib Creator',
        description: 'Create a madlib template',
        template:
          'Create a short madlib (2 sentences) about {{theme}}. Use placeholders like [adjective], [noun], [verb], [adverb]. Do not fill in the blanks.',
        template_language: 'handlebars',
        requires: {
          theme: 'string',
        },
        produces: {
          madlib: 'string',
        },
      },
    });

    // Create prompt spec for madlib completion
    const { data: storyPromptResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Madlib Completer',
        description: 'Complete the madlib by filling in blanks',
        template:
          'Complete this madlib by filling in the blanks with creative and funny words: {{madlib_template}}',
        template_language: 'handlebars',
        requires: {
          madlib_template: 'string',
        },
        produces: {
          completed_madlib: 'string',
        },
      },
    });

    // Create action for madlib creation
    const { data: premiseActionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Create Madlib Action',
        description: 'LLM action to create madlib template',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: premisePromptResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create action for madlib completion
    const { data: storyActionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Complete Madlib Action',
        description: 'LLM action to complete the madlib',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: storyPromptResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create workflow definition with two sequential nodes
    const { data: workflowDefResponse } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Two-Node Madlib Workflow ${Date.now()}`,
        description: 'Two-node workflow: create madlib template then complete it',
        version: 1,
        owner: {
          type: 'project' as const,
          project_id: projectResponse!.project.id,
        },
        input_schema: {
          type: 'object',
          properties: {
            theme: { type: 'string' },
          },
          required: ['theme'],
        },
        output_schema: {
          type: 'object',
          properties: {
            madlib_template: { type: 'string' },
            completed_madlib: { type: 'string' },
          },
        },
        initial_node_ref: 'create_madlib',
        nodes: [
          {
            ref: 'create_madlib',
            name: 'Create Madlib',
            action_id: premiseActionResponse!.action.id,
            action_version: 1,
            input_mapping: {
              theme: '$.input.theme',
            },
            output_mapping: {
              madlib: '$.response',
            },
          },
          {
            ref: 'complete_madlib',
            name: 'Complete Madlib',
            action_id: storyActionResponse!.action.id,
            action_version: 1,
            input_mapping: {
              madlib_template: '$.create_madlib_output.response',
            },
            output_mapping: {
              completed_madlib: '$.response',
            },
          },
        ],
        transitions: [
          {
            from_node_ref: 'create_madlib',
            to_node_ref: 'complete_madlib',
            priority: 1,
            condition: null,
          },
        ],
      },
    });

    // Create workflow binding
    const { data: workflowResponse } = await client.POST('/api/workflows', {
      body: {
        project_id: projectResponse!.project.id,
        workflow_def_id: workflowDefResponse!.workflow_def.id,
        name: `Test Two-Node Workflow ${Date.now()}`,
        description: 'Two-node workflow for execution test',
      },
    });

    // Start workflow execution
    const { data: startResponse, error: startError } = await client.POST(
      '/api/workflows/{id}/start',
      {
        params: { path: { id: workflowResponse!.workflow.id } },
        body: {
          theme: testTheme,
        },
      },
    );

    if (startError) {
      console.error('Workflow start error:', JSON.stringify(startError, null, 2));
    }
    expect(startError).toBeUndefined();
    expect(startResponse).toBeDefined();
    expect(startResponse!.workflow_run_id).toBeDefined();

    console.log('\n✅ Two-node madlib workflow started successfully');
    console.log(`   Workflow Run ID: ${startResponse!.workflow_run_id}`);
    console.log(`   Theme: ${testTheme}`);
    console.log(`   Check logs for madlib creation and completion`);

    // Cleanup
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
