import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Edge Test - Branching Architecture', () => {
  it('step 2: create project', async () => {
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
          temperature: 0.7,
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
        name: 'Ideation Prompt',
        description: 'Generate creative ideas',
        template: 'Generate a creative idea for: {{topic}}',
        template_language: 'handlebars',
        requires: {
          topic: 'string',
        },
        produces: {
          idea: 'string',
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

    // Cleanup: Delete in reverse order of creation
    await client.DELETE('/api/actions/{id}', {
      params: { path: { id: actionId } },
    });
    console.log('✓ Action deleted');
    await client.DELETE('/api/prompt-specs/{id}', {
      params: { path: { id: promptSpecId } },
    });
    console.log('✓ Prompt spec deleted');

    await client.DELETE('/api/model-profiles/{id}', {
      params: { path: { id: modelProfileId } },
    });
    console.log('✓ Model profile deleted');

    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectId } },
    });
    console.log('✓ Project deleted');

    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceId } },
    });
    console.log('✓ Workspace deleted');
  });
});
