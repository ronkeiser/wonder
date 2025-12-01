-- Seed data for Wonder database

-- Workspace
INSERT INTO workspaces (id, name, settings, created_at, updated_at)
VALUES (
  '01JDXSEED0000WORKSPACE00001',
  'Wonder',
  NULL,
  '2025-11-25T00:00:00.000Z',
  '2025-11-25T00:00:00.000Z'
);

-- Project (linked to workspace)
INSERT INTO projects (id, workspace_id, name, description, settings, created_at, updated_at)
VALUES (
  '01JDXSEED0000PROJECT000001',
  '01JDXSEED0000WORKSPACE00001',
  'Default Project',
  'Default project for Stage 0 vertical slice',
  NULL,
  '2025-11-25T00:00:00.000Z',
  '2025-11-25T00:00:00.000Z'
);

-- Model Profile (Workers AI Llama 3 8B)
INSERT INTO model_profiles (id, name, provider, model_id, parameters, execution_config, cost_per_1k_input_tokens, cost_per_1k_output_tokens)
VALUES (
  '01JDXSEED0000MODELPROF0001',
  'Llama 3 8B',
  'cloudflare',
  '@cf/meta/llama-3-8b-instruct',
  '{"temperature":0.7,"max_tokens":2048}',
  NULL,
  0,
  0
);

-- PromptSpec: Template for the greeting prompt
INSERT INTO prompt_specs (id, name, description, version, system_prompt, template, template_language, requires, produces, examples, tags, created_at, updated_at)
VALUES (
  '01JDXSEED0000PROMPTSPEC01',
  'Greeting Prompt',
  'Template for generating friendly greetings',
  1,
  NULL,
  'Generate a warm, friendly greeting for someone named {{name}}. Keep it short and cheerful.',
  'handlebars',
  '{"name":"string"}',
  '{"greeting":"string"}',
  NULL,
  NULL,
  '2025-11-25T00:00:00.000Z',
  '2025-11-25T00:00:00.000Z'
);

-- Action: LLM Call using the prompt spec
INSERT INTO actions (id, name, description, version, kind, implementation, requires, produces, execution, idempotency, created_at, updated_at)
VALUES (
  '01JDXSEED0000ACTION000001',
  'Greet User',
  'Generate a friendly greeting',
  1,
  'llm_call',
  '{"model_profile_id":"01JDXSEED0000MODELPROF0001","prompt_spec_id":"01JDXSEED0000PROMPTSPEC01"}',
  '{"name":"string"}',
  '{"greeting":"string"}',
  '{"timeout_seconds":30}',
  '{"level":"call"}',
  '2025-11-25T00:00:00.000Z',
  '2025-11-25T00:00:00.000Z'
);

-- Workflow Definition
INSERT INTO workflow_defs (id, name, description, version, owner_type, owner_id, tags, input_schema, output_schema, context_schema, initial_node_id, created_at, updated_at)
VALUES (
  '01JDXSEED0000WORKFLOWDEF1',
  'Hello World',
  'Simple one-node greeting workflow',
  1,
  'project',
  '01JDXSEED0000PROJECT000001',
  NULL,
  '{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}',
  '{"type":"object","properties":{"greeting":{"type":"string"}},"required":["greeting"]}',
  NULL,
  '01JDXSEED0000NODE0000001',
  '2025-11-25T00:00:00.000Z',
  '2025-11-25T00:00:00.000Z'
);

-- Workflow: Binds workflow_def to project
INSERT INTO workflows (id, project_id, name, description, workflow_def_id, pinned_version, enabled, created_at, updated_at)
VALUES (
  '01JDXSEED0000WORKFLOW0001',
  '01JDXSEED0000PROJECT000001',
  'Hello World',
  'Simple one-node greeting workflow',
  '01JDXSEED0000WORKFLOWDEF1',
  1,
  1,
  '2025-11-25T00:00:00.000Z',
  '2025-11-25T00:00:00.000Z'
);

-- Node: References action and workflow_def (with version!)
INSERT INTO nodes (id, workflow_def_id, workflow_def_version, name, action_id, action_version, input_mapping, output_mapping, fan_out, fan_in, joins_node, merge, on_early_complete)
VALUES (
  '01JDXSEED0000NODE0000001',
  '01JDXSEED0000WORKFLOWDEF1',
  1,
  'Greet',
  '01JDXSEED0000ACTION000001',
  1,
  '{"name":"$.input.name"}',
  '{"greeting":"$.greeting"}',
  'first_match',
  '"any"',
  NULL,
  NULL,
  NULL
);
