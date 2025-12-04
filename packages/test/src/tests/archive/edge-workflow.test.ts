import { describe, expect, it } from 'vitest';
import { client } from '../client';

describe('Workflow Execution API', () => {
  it('should start a workflow execution and return workflow_run_id', async () => {
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

    // Create prompt spec for node 1 (create madlib template)
    const { data: promptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Create Madlib Template',
        description: 'Creates a madlib template with placeholders',
        template:
          'Create a short madlib story (2-3 sentences) about {{topic}}. Use placeholders like [adjective], [noun], [verb], [adverb], [animal], [color]. Respond with ONLY valid JSON, no markdown formatting, no explanation. Use this exact format: {"template": "The [adjective] [animal] [verb] down the [color] path.", "placeholders": ["adjective", "animal", "verb", "color"]}',
        template_language: 'handlebars',
        requires: {
          topic: 'string',
        },
        produces: {
          template: 'string',
        },
      },
    });

    // Create prompt spec for node 2 (provide words for placeholders)
    const { data: promptSpec2Response } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Fill Madlib Blanks',
        description: 'Provides words for madlib placeholders without seeing the story',
        template:
          'I need words to fill in blanks for a madlib. The template has these placeholders: {{placeholders}}. For each placeholder, give me an appropriate word. Format your response as a simple list like:\n[adjective]: happy\n[noun]: banana\n[verb]: danced',
        template_language: 'handlebars',
        requires: {
          placeholders: 'string',
        },
        produces: {
          words: 'string',
        },
      },
    });

    // Create prompt spec for node 3 (compose final madlib)
    const { data: promptSpec3Response } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Compose Madlib',
        description: 'Combines template and words into final story',
        template:
          'Here is a madlib template: {{template}}\n\nHere are the words to fill in: {{words}}\n\nReplace each placeholder in the template with the corresponding word and output ONLY the final completed story.',
        template_language: 'handlebars',
        requires: {
          template: 'string',
          words: 'string',
        },
        produces: {
          story: 'string',
        },
      },
    });

    // Create action 1 (create template)
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Create Madlib Template Action',
        description: 'Creates madlib template with placeholders',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: promptSpecResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create action 2 (fill blanks)
    const { data: action2Response } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Fill Madlib Blanks Action',
        description: 'Provides words for placeholders',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: promptSpec2Response!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create action 3 (compose final story)
    const { data: action3Response } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Compose Madlib Action',
        description: 'Combines template and words into final story',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: promptSpec3Response!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create workflow definition with three LLM nodes
    const { data: workflowDefResponse, error: wfDefError } = await client.POST(
      '/api/workflow-defs',
      {
        body: {
          name: `Three Node Madlib Workflow ${Date.now()}`,
          description: 'Three-node madlib: create template, fill blanks, compose story',
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
              story: { type: 'string' },
            },
          },
          output_mapping: {
            story: '$.compose_output.story',
          },
          initial_node_ref: 'create_template',
          nodes: [
            {
              ref: 'create_template',
              name: 'Create Madlib Template',
              action_id: actionResponse!.action.id,
              action_version: 1,
              input_mapping: {
                topic: '$.input.topic',
              },
              output_mapping: {
                template: '$.response',
              },
            },
            {
              ref: 'fill_blanks',
              name: 'Fill Madlib Blanks',
              action_id: action2Response!.action.id,
              action_version: 1,
              input_mapping: {
                placeholders: '$.create_template_output.template',
              },
              output_mapping: {
                words: '$.response',
              },
            },
            {
              ref: 'compose',
              name: 'Compose Final Story',
              action_id: action3Response!.action.id,
              action_version: 1,
              input_mapping: {
                template: '$.create_template_output.template',
                words: '$.fill_blanks_output.words',
              },
              output_mapping: {
                story: '$.response',
              },
            },
          ],
          transitions: [
            {
              from_node_ref: 'create_template',
              to_node_ref: 'fill_blanks',
              priority: 1,
            },
            {
              from_node_ref: 'fill_blanks',
              to_node_ref: 'compose',
              priority: 1,
            },
          ],
        },
      },
    );

    if (wfDefError) {
      console.error('Workflow def creation error:', JSON.stringify(wfDefError, null, 2));
    }
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
          topic: testTopic,
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

    console.log('\n✅ Workflow started successfully');
    console.log(`   Workflow Run ID: ${startResponse!.workflow_run_id}`);
    console.log(`   Check logs and events for execution details`);

    // Cleanup
    await client.DELETE('/api/projects/{id}', {
      params: { path: { id: projectResponse!.project.id } },
    });
    await client.DELETE('/api/workspaces/{id}', {
      params: { path: { id: workspaceResponse!.workspace.id } },
    });
  });
});
