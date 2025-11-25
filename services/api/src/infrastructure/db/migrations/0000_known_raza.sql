CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`implementation` text NOT NULL,
	`requires` text,
	`produces` text,
	`execution` text,
	`idempotency` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `artifact_types` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`schema` text NOT NULL,
	`version` integer NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type_id` text NOT NULL,
	`type_version` integer NOT NULL,
	`content` text NOT NULL,
	`created_by_workflow_run_id` text,
	`created_by_node_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_artifacts_project_type` ON `artifacts` (`project_id`,`type_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_workflow_run` ON `artifacts` (`created_by_workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_created_at` ON `artifacts` (`created_at`);--> statement-breakpoint
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
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`timestamp` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_run_sequence` ON `events` (`workflow_run_id`,`sequence_number`);--> statement-breakpoint
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
CREATE TABLE `model_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`parameters` text NOT NULL,
	`execution_config` text,
	`cost_per_1k_input_tokens` real NOT NULL,
	`cost_per_1k_output_tokens` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_def_id` text NOT NULL,
	`name` text NOT NULL,
	`action_id` text NOT NULL,
	`input_mapping` text,
	`output_mapping` text,
	`fan_out` text NOT NULL,
	`fan_in` text NOT NULL,
	`joins_node` text,
	`merge` text,
	`on_early_complete` text,
	FOREIGN KEY (`workflow_def_id`) REFERENCES `workflow_defs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_nodes_workflow_def` ON `nodes` (`workflow_def_id`);--> statement-breakpoint
CREATE INDEX `idx_nodes_action` ON `nodes` (`action_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`settings` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_projects_workspace` ON `projects` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `prompt_specs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer NOT NULL,
	`system_prompt` text,
	`template` text NOT NULL,
	`template_language` text NOT NULL,
	`requires` text NOT NULL,
	`produces` text NOT NULL,
	`examples` text,
	`tags` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_def_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`priority` integer NOT NULL,
	`condition` text,
	`foreach` text,
	`loop_config` text,
	FOREIGN KEY (`workflow_def_id`) REFERENCES `workflow_defs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transitions_workflow_def` ON `transitions` (`workflow_def_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_from_node` ON `transitions` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_to_node` ON `transitions` (`to_node_id`);--> statement-breakpoint
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
CREATE TABLE `workflow_defs` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`tags` text,
	`input_schema` text NOT NULL,
	`output_schema` text NOT NULL,
	`context_schema` text,
	`initial_node_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_owner` ON `workflow_defs` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_name_version` ON `workflow_defs` (`name`,`owner_type`,`owner_id`,`version`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`workflow_def_id` text NOT NULL,
	`workflow_version` integer NOT NULL,
	`status` text NOT NULL,
	`context` text NOT NULL,
	`active_tokens` text NOT NULL,
	`durable_object_id` text NOT NULL,
	`latest_snapshot` text,
	`parent_run_id` text,
	`parent_node_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_project` ON `workflow_runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_parent` ON `workflow_runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_created_at` ON `workflow_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`workflow_def_id` text NOT NULL,
	`pinned_version` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflows_project` ON `workflows` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflows_def` ON `workflows` (`workflow_def_id`,`pinned_version`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`settings` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
