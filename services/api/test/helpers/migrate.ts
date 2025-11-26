/** Test database migration helpers */

import type { DrizzleD1Database } from 'drizzle-orm/d1';

// Inline migration SQL to avoid filesystem access issues in Cloudflare workers environment
const MIGRATION_SQL = `
CREATE TABLE actions (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	description text NOT NULL,
	version integer NOT NULL,
	kind text NOT NULL,
	implementation text NOT NULL,
	requires text,
	produces text,
	execution text,
	idempotency text,
	created_at text NOT NULL,
	updated_at text NOT NULL
);
CREATE TABLE actors (
	id text PRIMARY KEY NOT NULL,
	type text NOT NULL,
	name text NOT NULL,
	email text,
	permissions text NOT NULL,
	created_at text NOT NULL
);
CREATE UNIQUE INDEX unique_actors_email ON actors (email);
CREATE TABLE artifact_types (
	id text NOT NULL,
	name text NOT NULL,
	description text NOT NULL,
	schema text NOT NULL,
	version integer NOT NULL,
	PRIMARY KEY(id, version)
);
CREATE TABLE artifacts (
	id text PRIMARY KEY NOT NULL,
	project_id text NOT NULL,
	type_id text NOT NULL,
	type_version integer NOT NULL,
	content text NOT NULL,
	created_by_workflow_run_id text,
	created_by_node_id text,
	created_at text NOT NULL,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (created_by_workflow_run_id) REFERENCES workflow_runs(id) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (created_by_node_id) REFERENCES nodes(id) ON UPDATE no action ON DELETE no action
);
CREATE INDEX idx_artifacts_project_type ON artifacts (project_id,type_id);
CREATE INDEX idx_artifacts_workflow_run ON artifacts (created_by_workflow_run_id);
CREATE INDEX idx_artifacts_created_at ON artifacts (created_at);
CREATE TABLE event_sources (
	id text PRIMARY KEY NOT NULL,
	workspace_id text NOT NULL,
	name text NOT NULL,
	description text,
	source_type text NOT NULL,
	config text NOT NULL,
	enabled integer DEFAULT 1 NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_event_sources_workspace ON event_sources (workspace_id);
CREATE UNIQUE INDEX unique_event_sources_workspace_name ON event_sources (workspace_id,name);
CREATE TABLE events (
	id text PRIMARY KEY NOT NULL,
	workflow_run_id text NOT NULL,
	sequence_number integer NOT NULL,
	kind text NOT NULL,
	payload text NOT NULL,
	timestamp text NOT NULL,
	archived_at text,
	FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_events_run_sequence ON events (workflow_run_id,sequence_number);
CREATE INDEX idx_events_timestamp ON events (timestamp);
CREATE INDEX idx_events_kind ON events (kind);
CREATE INDEX idx_events_archived_at ON events (archived_at);
CREATE TABLE libraries (
	id text PRIMARY KEY NOT NULL,
	workspace_id text,
	name text NOT NULL,
	description text,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_libraries_workspace ON libraries (workspace_id);
CREATE UNIQUE INDEX unique_libraries_workspace_name ON libraries (workspace_id,name);
CREATE TABLE mcp_servers (
	id text PRIMARY KEY NOT NULL,
	workspace_id text NOT NULL,
	name text NOT NULL,
	description text,
	transport_type text NOT NULL,
	command text,
	args text,
	url text,
	environment_variables text,
	enabled integer DEFAULT 1 NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_mcp_servers_workspace ON mcp_servers (workspace_id);
CREATE UNIQUE INDEX unique_mcp_servers_workspace_name ON mcp_servers (workspace_id,name);
CREATE TABLE model_profiles (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	provider text NOT NULL,
	model_id text NOT NULL,
	parameters text NOT NULL,
	execution_config text,
	cost_per_1k_input_tokens real NOT NULL,
	cost_per_1k_output_tokens real NOT NULL
);
CREATE TABLE nodes (
	id text PRIMARY KEY NOT NULL,
	workflow_def_id text NOT NULL,
	name text NOT NULL,
	action_id text NOT NULL,
	input_mapping text,
	output_mapping text,
	fan_out text NOT NULL,
	fan_in text NOT NULL,
	joins_node text,
	merge text,
	on_early_complete text,
	FOREIGN KEY (action_id) REFERENCES actions(id) ON UPDATE no action ON DELETE no action
);
CREATE INDEX idx_nodes_workflow_def ON nodes (workflow_def_id);
CREATE INDEX idx_nodes_action ON nodes (action_id);
CREATE TABLE projects (
	id text PRIMARY KEY NOT NULL,
	workspace_id text NOT NULL,
	name text NOT NULL,
	description text,
	settings text,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_projects_workspace ON projects (workspace_id);
CREATE TABLE prompt_specs (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	description text NOT NULL,
	version integer NOT NULL,
	system_prompt text,
	template text NOT NULL,
	template_language text NOT NULL,
	requires text NOT NULL,
	produces text NOT NULL,
	examples text,
	tags text,
	created_at text NOT NULL,
	updated_at text NOT NULL
);
CREATE TABLE secrets (
	id text PRIMARY KEY NOT NULL,
	workspace_id text NOT NULL,
	key text NOT NULL,
	encrypted_value text NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX unique_secrets_workspace_key ON secrets (workspace_id,key);
CREATE TABLE transitions (
	id text PRIMARY KEY NOT NULL,
	workflow_def_id text NOT NULL,
	from_node_id text NOT NULL,
	to_node_id text NOT NULL,
	priority integer NOT NULL,
	condition text,
	foreach text,
	loop_config text,
	FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_transitions_workflow_def ON transitions (workflow_def_id);
CREATE INDEX idx_transitions_from_node ON transitions (from_node_id);
CREATE INDEX idx_transitions_to_node ON transitions (to_node_id);
CREATE TABLE triggers (
	id text PRIMARY KEY NOT NULL,
	workflow_id text NOT NULL,
	kind text NOT NULL,
	config text NOT NULL,
	enabled integer DEFAULT 1 NOT NULL,
	created_at text NOT NULL,
	FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_triggers_workflow ON triggers (workflow_id);
CREATE INDEX idx_triggers_kind ON triggers (kind,enabled);
CREATE TABLE vector_indexes (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	vectorize_index_id text NOT NULL,
	artifact_type_ids text NOT NULL,
	embedding_provider text NOT NULL,
	embedding_model text NOT NULL,
	dimensions integer NOT NULL,
	content_fields text NOT NULL,
	auto_index integer DEFAULT 0 NOT NULL,
	created_at text NOT NULL
);
CREATE UNIQUE INDEX unique_vectorize_index_id ON vector_indexes (vectorize_index_id);
CREATE TABLE workflow_defs (
	id text NOT NULL,
	name text NOT NULL,
	description text NOT NULL,
	version integer NOT NULL,
	owner_type text NOT NULL,
	owner_id text NOT NULL,
	tags text,
	input_schema text NOT NULL,
	output_schema text NOT NULL,
	context_schema text,
	initial_node_id text NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	PRIMARY KEY(id, version)
);
CREATE INDEX idx_workflow_defs_owner ON workflow_defs (owner_type,owner_id);
CREATE INDEX idx_workflow_defs_name_version ON workflow_defs (name,owner_type,owner_id,version);
CREATE TABLE workflow_runs (
	id text PRIMARY KEY NOT NULL,
	project_id text NOT NULL,
	workflow_id text NOT NULL,
	workflow_def_id text NOT NULL,
	workflow_version integer NOT NULL,
	status text NOT NULL,
	context text NOT NULL,
	active_tokens text NOT NULL,
	durable_object_id text NOT NULL,
	latest_snapshot text,
	parent_run_id text,
	parent_node_id text,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	completed_at text,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (parent_node_id) REFERENCES nodes(id) ON UPDATE no action ON DELETE no action
);
CREATE INDEX idx_workflow_runs_project ON workflow_runs (project_id);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs (workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs (status);
CREATE INDEX idx_workflow_runs_parent ON workflow_runs (parent_run_id);
CREATE INDEX idx_workflow_runs_created_at ON workflow_runs (created_at);
CREATE TABLE workflows (
	id text PRIMARY KEY NOT NULL,
	project_id text NOT NULL,
	name text NOT NULL,
	description text NOT NULL,
	workflow_def_id text NOT NULL,
	pinned_version integer,
	enabled integer DEFAULT 1 NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX idx_workflows_project ON workflows (project_id);
CREATE INDEX idx_workflows_def ON workflows (workflow_def_id,pinned_version);
CREATE TABLE workspaces (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	settings text,
	created_at text NOT NULL,
	updated_at text NOT NULL
);
CREATE TABLE logs (
	id text PRIMARY KEY NOT NULL,
	level text NOT NULL,
	event_type text NOT NULL,
	message text,
	metadata text NOT NULL,
	timestamp integer NOT NULL
);
CREATE INDEX idx_logs_level ON logs (level);
CREATE INDEX idx_logs_event_type ON logs (event_type);
CREATE INDEX idx_logs_timestamp ON logs (timestamp);
`;

// Stage 0 seed data
const SEED_SQL = `
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
`;

export async function migrate(db: DrizzleD1Database): Promise<void> {
  // Split by statement breaks and execute each statement
  const statements = MIGRATION_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.run(statement);
  }
}

export async function seed(db: DrizzleD1Database): Promise<void> {
  // Split by statement breaks and execute each statement
  const statements = SEED_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.run(statement);
  }
}
