import { describe, expect, it } from 'vitest';
import { client } from '~/client';

const IDEATION_COUNT = 5;
const JUDGE_COUNT = 5;

describe('Edge Test - Branching Architecture (Working Copy)', () => {
  it('fan-out → merge → fan-out → merge → rank', async () => {
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
          max_tokens: 512,
          temperature: 1.2,
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

    // Step 4: Create ideation prompt spec
    const { data: ideationPromptResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Dog Name Ideation',
        description: 'Generate creative dog name ideas',
        template: 'Suggest a fun and friendly name for my dog. Make it just a little quirky!',
        template_language: 'handlebars',
        requires: {},
        produces: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    });

    expect(ideationPromptResponse).toBeDefined();
    expect(ideationPromptResponse!.prompt_spec.id).toBeDefined();

    const ideationPromptId = ideationPromptResponse!.prompt_spec.id;
    console.log('✓ Ideation prompt spec created:', ideationPromptId);

    // Step 5: Create judging prompt spec
    const { data: judgingPromptResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Dog Name Judge',
        description: 'Judge dog names and score them',
        template:
          'You are a dog name expert. Rate these dog names from 1-10 based on creativity, friendliness, and memorability:\n\n{{#each names}}\n- {{this}}\n{{/each}}',
        template_language: 'handlebars',
        requires: {
          names: 'array',
        },
        produces: {
          type: 'object',
          properties: {
            scores: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  score: { type: 'number' },
                },
                required: ['name', 'score'],
                additionalProperties: false,
              },
            },
          },
          required: ['scores'],
          additionalProperties: false,
        },
      },
    });

    expect(judgingPromptResponse).toBeDefined();
    expect(judgingPromptResponse!.prompt_spec.id).toBeDefined();

    const judgingPromptId = judgingPromptResponse!.prompt_spec.id;
    console.log('✓ Judging prompt spec created:', judgingPromptId);

    // Step 6: Create ranking prompt spec
    const { data: rankingPromptResponse } = await client.POST('/api/prompt-specs', {
      body: {
        version: 1,
        name: 'Dog Name Ranker',
        description: 'Aggregate judge scores and create final ranking',
        template:
          'Aggregate these judge scores and create a final ranking. Each judge scored the same set of names:\n\n{{#each judge_scores}}\nJudge {{@index}}:\n{{#each this}}\n- {{this.name}}: {{this.score}}/10\n{{/each}}\n{{/each}}\n\nCalculate average scores and rank the names.',
        template_language: 'handlebars',
        requires: {
          judge_scores: 'array',
        },
        produces: {
          type: 'object',
          properties: {
            ranking: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  average_score: { type: 'number' },
                  rank: { type: 'number' },
                },
                required: ['name', 'average_score', 'rank'],
                additionalProperties: false,
              },
            },
          },
          required: ['ranking'],
          additionalProperties: false,
        },
      },
    });

    expect(rankingPromptResponse).toBeDefined();
    expect(rankingPromptResponse!.prompt_spec.id).toBeDefined();

    const rankingPromptId = rankingPromptResponse!.prompt_spec.id;
    console.log('✓ Ranking prompt spec created:', rankingPromptId);

    // Step 7: Create ideation action
    const { data: ideationActionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Ideation Action',
        description: 'LLM action for generating ideas',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: ideationPromptId,
          model_profile_id: modelProfileId,
        },
      },
    });

    expect(ideationActionResponse).toBeDefined();
    expect(ideationActionResponse!.action.id).toBeDefined();

    const ideationActionId = ideationActionResponse!.action.id;
    console.log('✓ Ideation action created:', ideationActionId);

    // Step 8: Create judging action
    const { data: judgingActionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Judging Action',
        description: 'LLM action for judging names',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: judgingPromptId,
          model_profile_id: modelProfileId,
        },
      },
    });

    expect(judgingActionResponse).toBeDefined();
    expect(judgingActionResponse!.action.id).toBeDefined();

    const judgingActionId = judgingActionResponse!.action.id;
    console.log('✓ Judging action created:', judgingActionId);

    // Step 9: Create ranking action
    const { data: rankingActionResponse } = await client.POST('/api/actions', {
      body: {
        version: 1,
        name: 'Ranking Action',
        description: 'LLM action for final ranking',
        kind: 'llm_call',
        implementation: {
          prompt_spec_id: rankingPromptId,
          model_profile_id: modelProfileId,
        },
      },
    });

    expect(rankingActionResponse).toBeDefined();
    expect(rankingActionResponse!.action.id).toBeDefined();

    const rankingActionId = rankingActionResponse!.action.id;
    console.log('✓ Ranking action created:', rankingActionId);

    // Step 10: Create workflow definition with two-stage fan-out
    const { data: workflowDefResponse, error: workflowDefError } = await client.POST(
      '/api/workflow-defs',
      {
        body: {
          name: `Dog Name Pipeline ${Date.now()}`,
          description: 'Tests ideation → judging → ranking pipeline',
          project_id: projectId,
          input_schema: {
            type: 'object',
            properties: {},
          },
          output_schema: {
            type: 'object',
            properties: {
              ranking: {
                type: 'array',
                items: { type: 'object' },
              },
            },
            required: ['ranking'],
          },
          output_mapping: {
            ranking: '$.ranking_node_output.ranking',
          },
          initial_node_ref: 'start_node',
          nodes: [
            {
              ref: 'start_node',
              name: 'Start',
            },
            {
              ref: 'ideation_node',
              name: 'Dog Name Ideation',
              action_id: ideationActionId,
              action_version: 1,
              input_mapping: {},
              output_mapping: {
                name: '$.response.name',
              },
            },
            {
              ref: 'merge_names_node',
              name: 'Merge Names',
            },
            {
              ref: 'judging_node',
              name: 'Judge Names',
              action_id: judgingActionId,
              action_version: 1,
              input_mapping: {
                names: '$.merge_names_node_output.all_names',
              },
              output_mapping: {
                scores: '$.response.scores',
              },
            },
            {
              ref: 'merge_scores_node',
              name: 'Merge Judge Scores',
            },
            {
              ref: 'ranking_node',
              name: 'Final Ranking',
              action_id: rankingActionId,
              action_version: 1,
              input_mapping: {
                judge_scores: '$.merge_scores_node_output.all_scores',
              },
              output_mapping: {
                ranking: '$.response.ranking',
              },
            },
          ],
          transitions: [
            {
              ref: 'start_to_ideation',
              from_node_ref: 'start_node',
              to_node_ref: 'ideation_node',
              priority: 1,
              spawn_count: IDEATION_COUNT,
            },
            {
              ref: 'ideation_to_merge',
              from_node_ref: 'ideation_node',
              to_node_ref: 'merge_names_node',
              priority: 1,
              synchronization: {
                wait_for: 'all',
                joins_transition: 'start_to_ideation',
                merge: {
                  source: '*.name',
                  target: '$.merge_names_node_output.all_names',
                  strategy: 'array',
                },
              },
            },
            {
              ref: 'merge_to_judging',
              from_node_ref: 'merge_names_node',
              to_node_ref: 'judging_node',
              priority: 1,
              spawn_count: JUDGE_COUNT,
            },
            {
              ref: 'judging_to_merge',
              from_node_ref: 'judging_node',
              to_node_ref: 'merge_scores_node',
              priority: 1,
              synchronization: {
                wait_for: 'all',
                joins_transition: 'merge_to_judging',
                merge: {
                  source: '*.scores',
                  target: '$.merge_scores_node_output.all_scores',
                  strategy: 'array',
                },
              },
            },
            {
              ref: 'merge_to_ranking',
              from_node_ref: 'merge_scores_node',
              to_node_ref: 'ranking_node',
              priority: 1,
            },
          ],
        },
      },
    );

    if (workflowDefError) {
      console.error('Workflow def creation error:', workflowDefError);
      throw new Error(`Failed to create workflow def: ${JSON.stringify(workflowDefError)}`);
    }

    expect(workflowDefResponse).toBeDefined();
    expect(workflowDefResponse!.workflow_def_id).toBeDefined();
    expect(workflowDefResponse!.workflow_def.initial_node_id).toBeDefined();

    const workflowDefId = workflowDefResponse!.workflow_def_id;
    console.log('✓ Workflow def created:', workflowDefId);
    console.log('  Initial node ID:', workflowDefResponse!.workflow_def.initial_node_id);

    // Step 11: Create workflow (binds workflow_def to project)
    const { data: workflowResponse, error: workflowError } = await client.POST('/api/workflows', {
      body: {
        project_id: projectId,
        workflow_def_id: workflowDefId,
        name: `Dog Name Pipeline ${Date.now()}`,
        description: 'Tests ideation → judging → ranking with multiple fan-out/fan-in',
      },
    });

    expect(workflowError).toBeUndefined();
    expect(workflowResponse).toBeDefined();
    expect(workflowResponse!.workflow).toBeDefined();
    expect(workflowResponse!.workflow.id).toBeDefined();

    const workflowId = workflowResponse!.workflow.id;
    console.log('✓ Workflow created:', workflowId);

    // Step 12: Start workflow execution
    const { data: startResponse, error: startError } = await client.POST(
      '/api/workflows/{id}/start',
      {
        params: { path: { id: workflowId } },
        body: {},
      },
    );

    expect(startError).toBeUndefined();
    expect(startResponse).toBeDefined();
    expect(startResponse!.workflow_run_id).toBeDefined();

    console.log('✓ Workflow started:', startResponse!.workflow_run_id);
    console.log(`  Flow: ${IDEATION_COUNT} names → ${JUDGE_COUNT} judges → final ranking`);
  });
});
