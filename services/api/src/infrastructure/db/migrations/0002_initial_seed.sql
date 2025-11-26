-- Stage 0 seed data: workspace, project, model_profile
-- These are the base entities needed for the vertical slice

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
