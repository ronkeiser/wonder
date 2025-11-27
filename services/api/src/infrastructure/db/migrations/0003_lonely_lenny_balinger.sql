DROP TABLE IF EXISTS `nodes`;--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_def_id` text NOT NULL,
	`workflow_def_version` integer NOT NULL,
	`name` text NOT NULL,
	`action_id` text NOT NULL,
	`input_mapping` text,
	`output_mapping` text,
	`fan_out` text NOT NULL,
	`fan_in` text NOT NULL,
	`joins_node` text,
	`merge` text,
	`on_early_complete` text,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `idx_nodes_workflow_def` ON `nodes` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_action` ON `nodes` (`action_id`);--> statement-breakpoint
DROP TABLE IF EXISTS `transitions`;--> statement-breakpoint
CREATE TABLE `transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_def_id` text NOT NULL,
	`workflow_def_version` integer NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`priority` integer NOT NULL,
	`condition` text,
	`foreach` text,
	`loop_config` text,
	FOREIGN KEY (`from_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `idx_transitions_workflow_def` ON `transitions` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_transitions_from_node` ON `transitions` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_to_node` ON `transitions` (`to_node_id`);--> statement-breakpoint

-- Hello World workflow seed data
-- Complete minimal working example with all required entities

-- 1. PromptSpec: Template for the greeting prompt
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
);--> statement-breakpoint

-- 2. Action: LLM Call using the prompt spec
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
);--> statement-breakpoint

-- 3. Workflow Definition
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
);--> statement-breakpoint

-- 4. Workflow: Binds workflow_def to project
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
);--> statement-breakpoint

-- 5. Node: References action and workflow_def (with version!)
INSERT INTO nodes (id, workflow_def_id, workflow_def_version, name, action_id, input_mapping, output_mapping, fan_out, fan_in, joins_node, merge, on_early_complete)
VALUES (
  '01JDXSEED0000NODE0000001',
  '01JDXSEED0000WORKFLOWDEF1',
  1,
  'Greet',
  '01JDXSEED0000ACTION000001',
  '{"name":"$.input.name"}',
  '{"greeting":"$.greeting"}',
  'first_match',
  '"any"',
  NULL,
  NULL,
  NULL
);