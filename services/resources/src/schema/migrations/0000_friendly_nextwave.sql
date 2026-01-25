CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`permissions` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_actors_email` ON `actors` (`email`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project_ids` text NOT NULL,
	`persona_id` text,
	`persona_version` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_persona` ON `agents` (`persona_id`,`persona_version`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type_id` text NOT NULL,
	`type_version` integer NOT NULL,
	`content` text NOT NULL,
	`created_by_workflow_run_id` text,
	`created_by_definition_id` text,
	`created_by_definition_version` integer,
	`created_by_node_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_definition_id`,`created_by_definition_version`,`created_by_node_id`) REFERENCES `nodes`(`definition_id`,`definition_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_artifacts_project_type` ON `artifacts` (`project_id`,`type_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_workflow_run` ON `artifacts` (`created_by_workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_created_at` ON `artifacts` (`created_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`participants` text NOT NULL,
	`status` text NOT NULL,
	`resolved_persona_id` text,
	`resolved_persona_version` integer,
	`resolved_model_profile_id` text,
	`resolved_model_profile_version` integer,
	`resolved_context_assembly_workflow_id` text,
	`resolved_context_assembly_workflow_version` integer,
	`resolved_memory_extraction_workflow_id` text,
	`resolved_memory_extraction_workflow_version` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_status` ON `conversations` (`status`);--> statement-breakpoint
CREATE TABLE `definitions` (
	`id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`project_id` text,
	`library_id` text,
	`content_hash` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_definitions_kind` ON `definitions` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_definitions_reference` ON `definitions` (`reference`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_definitions_scope` ON `definitions` (`project_id`,`library_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_definitions_version` ON `definitions` (`kind`,`reference`,`version`,`project_id`,`library_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_definitions_content` ON `definitions` (`kind`,`reference`,`content_hash`,`project_id`,`library_id`);--> statement-breakpoint
CREATE TABLE `event_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_type` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_event_sources_workspace` ON `event_sources` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_event_sources_workspace_name` ON `event_sources` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `events` (
	`workflow_run_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`timestamp` text NOT NULL,
	`archived_at` text,
	PRIMARY KEY(`workflow_run_id`, `sequence_number`),
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_kind` ON `events` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_events_archived_at` ON `events` (`archived_at`);--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_libraries_workspace` ON `libraries` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_libraries_workspace_name` ON `libraries` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`transport_type` text NOT NULL,
	`command` text,
	`args` text,
	`url` text,
	`environment_variables` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_servers_workspace` ON `mcp_servers` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_mcp_servers_workspace_name` ON `mcp_servers` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text NOT NULL,
	`ref` text NOT NULL,
	`definition_id` text NOT NULL,
	`definition_version` integer NOT NULL,
	`name` text NOT NULL,
	`task_id` text,
	`task_version` integer,
	`subworkflow_id` text,
	`subworkflow_version` integer,
	`input_mapping` text,
	`output_mapping` text,
	`resource_bindings` text,
	PRIMARY KEY(`definition_id`, `definition_version`, `id`),
	FOREIGN KEY (`definition_id`,`definition_version`) REFERENCES `definitions`(`id`,`version`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_nodes_definition` ON `nodes` (`definition_id`,`definition_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_task` ON `nodes` (`task_id`,`task_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_ref` ON `nodes` (`definition_id`,`definition_version`,`ref`);--> statement-breakpoint
CREATE TABLE `project_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`default_model_profile_id` text,
	`rate_limit_max_concurrent_runs` integer,
	`rate_limit_max_llm_calls_per_hour` integer,
	`budget_max_monthly_spend_cents` integer,
	`budget_alert_threshold_cents` integer,
	`snapshot_policy_every_n_events` integer,
	`snapshot_policy_every_n_seconds` integer,
	`snapshot_policy_on_fan_in_complete` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_projects_workspace` ON `projects` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_secrets_workspace_key` ON `secrets` (`workspace_id`,`key`);--> statement-breakpoint
CREATE TABLE `tools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`library_id` text,
	`input_schema` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`async` integer DEFAULT false NOT NULL,
	`invocation_mode` text,
	`input_mapping` text,
	`retry` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tools_library` ON `tools` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_tools_name` ON `tools` (`name`,`library_id`);--> statement-breakpoint
CREATE INDEX `idx_tools_target` ON `tools` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `transitions` (
	`id` text NOT NULL,
	`ref` text,
	`definition_id` text NOT NULL,
	`definition_version` integer NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`priority` integer NOT NULL,
	`condition` text,
	`spawn_count` integer,
	`sibling_group` text,
	`foreach` text,
	`synchronization` text,
	`loop_config` text,
	PRIMARY KEY(`definition_id`, `definition_version`, `id`),
	FOREIGN KEY (`definition_id`,`definition_version`) REFERENCES `definitions`(`id`,`version`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`,`definition_version`,`from_node_id`) REFERENCES `nodes`(`definition_id`,`definition_version`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`,`definition_version`,`to_node_id`) REFERENCES `nodes`(`definition_id`,`definition_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transitions_definition` ON `transitions` (`definition_id`,`definition_version`);--> statement-breakpoint
CREATE INDEX `idx_transitions_from_node` ON `transitions` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_to_node` ON `transitions` (`to_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_ref` ON `transitions` (`definition_id`,`definition_version`,`ref`);--> statement-breakpoint
CREATE TABLE `triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_triggers_workflow` ON `triggers` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_triggers_kind` ON `triggers` (`kind`,`enabled`);--> statement-breakpoint
CREATE TABLE `vector_indexes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`vectorize_index_id` text NOT NULL,
	`artifact_type_ids` text NOT NULL,
	`embedding_provider` text NOT NULL,
	`embedding_model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`content_fields` text NOT NULL,
	`auto_index` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_vectorize_index_id` ON `vector_indexes` (`vectorize_index_id`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workflow_id` text,
	`definition_id` text NOT NULL,
	`definition_version` integer NOT NULL,
	`status` text NOT NULL,
	`context` text NOT NULL,
	`active_tokens` text NOT NULL,
	`durable_object_id` text NOT NULL,
	`latest_snapshot` text,
	`root_run_id` text NOT NULL,
	`parent_run_id` text,
	`parent_node_id` text,
	`parent_token_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`definition_id`,`definition_version`,`parent_node_id`) REFERENCES `nodes`(`definition_id`,`definition_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_project` ON `workflow_runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_root` ON `workflow_runs` (`root_run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_parent` ON `workflow_runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_created_at` ON `workflow_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`definition_id` text NOT NULL,
	`pinned_version` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflows_project` ON `workflows` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflows_definition` ON `workflows` (`definition_id`,`pinned_version`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`allowed_model_providers` text,
	`allowed_mcp_servers` text,
	`budget_max_monthly_spend_cents` integer,
	`budget_alert_threshold_cents` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
