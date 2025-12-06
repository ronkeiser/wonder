import { describe, expect, it } from 'vitest';
import { client } from '~/client';

describe('Single Node JSON Output', () => {
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
          temperature: 1.0,
        },
        cost_per_1k_input_tokens: 0.0,
        cost_per_1k_output_tokens: 0.0,
      },
    });

    // Create prompt spec for madlib generation
    const { data: templatePromptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Generate Madlib Template',
        description: 'Creates a madlib template with placeholders',
        template:
          'Create a fun and varied 2-3 sentence madlib story about {{topic}}. IMPORTANT: Be creative with story structure - vary sentence lengths, change the order of events, try different narrative perspectives. Avoid common or formulaic patterns. Use diverse SPECIFIC placeholders in [brackets] like [city], [food item], [weather condition], [body part], [vehicle], [profession], [musical instrument], [mythical creature], [feeling], [historical figure].\n\nMake the story structure unique and surprising.\n\nReturn JSON with:\n- "template": the story with [placeholders]\n- "placeholders": array of placeholder types used\n\nExample: {"template": "The [profession] rode a [vehicle] to [city].", "placeholders": ["profession", "vehicle", "city"]}',
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

    // Create action for template generation
    const { data: actionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Generate Madlib Action',
        description: 'LLM action to generate madlib template',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: templatePromptSpecResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create prompt spec for word generation
    const { data: wordPromptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Generate Madlib Words',
        description: 'Generates creative words for madlib placeholders',
        template:
          'Generate varied and interesting words for these placeholder types: {{placeholders}}\n\nUse mostly common to slightly unusual words. Be creative - pick unpredictable words and avoid obvious or cliche choices. Think of fresh, diverse options that are fun and natural.\n\nReturn JSON with each placeholder type as a key and a creative word as the value.\n\nExample: {"city": "Prague", "food item": "mango", "vehicle": "gondola"}',
        template_language: 'handlebars',
        requires: {
          placeholders: 'array',
        },
        produces: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
    });

    // Create action for word generation
    const { data: wordActionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Generate Words Action',
        description: 'LLM action to generate words for placeholders',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: wordPromptSpecResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create prompt spec for story completion
    const { data: completePromptSpecResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Complete Madlib Story',
        description: 'Fills in the madlib template with words to create final story',
        template:
          'Create a story by filling in this madlib template:\n\n{{template}}\n\nUsing these random words:\n{{json words}}\n\nReplace each [placeholder] with its matching word from the JSON. You may adjust plurality (singular/plural) and verb tense to make the grammar correct, but you MUST use the fundamental word provided - do not substitute different words. Add small connecting words (a, an, the, etc.) only as needed for proper grammar.\n\nReturn the completed story with all placeholders replaced.',
        template_language: 'handlebars',
        requires: {
          template: 'string',
          words: 'object',
        },
        produces: {
          story: 'string',
        },
      },
    });

    // Create action for story completion
    const { data: completeActionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Complete Story Action',
        description: 'LLM action to complete the madlib story',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: completePromptSpecResponse!.prompt_spec.id,
          model_profile_id: modelProfileResponse!.model_profile.id,
        },
      },
    });

    // Create workflow definition with three nodes
    const { data: workflowDefResponse } = await client.POST('/api/workflow-defs', {
      body: {
        name: `Three Node Madlib Workflow ${Date.now()}`,
        description: 'Three node workflow: generate template, generate words, complete story',
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
          story: '$.complete_output.story',
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
              template: '$.response.template',
              placeholders: '$.response.placeholders',
            },
          },
          {
            ref: 'fill_words',
            name: 'Generate Words for Placeholders',
            action_id: wordActionResponse!.action.id,
            action_version: 1,
            input_mapping: {
              placeholders: '$.generate_output.placeholders',
            },
            output_mapping: {
              words: '$.response',
            },
          },
          {
            ref: 'complete',
            name: 'Complete Madlib Story',
            action_id: completeActionResponse!.action.id,
            action_version: 1,
            input_mapping: {
              template: '$.generate_output.template',
              words: '$.fill_words_output.words',
            },
            output_mapping: {
              story: '$.response.story',
            },
          },
        ],
        transitions: [
          {
            from_node_id: null, // Will be set by API using refs
            to_node_id: null,
            from_node_ref: 'generate',
            to_node_ref: 'fill_words',
            priority: 1,
          },
          {
            from_node_id: null,
            to_node_id: null,
            from_node_ref: 'fill_words',
            to_node_ref: 'complete',
            priority: 1,
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
        description: 'Three node test workflow - complete madlib pipeline',
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
