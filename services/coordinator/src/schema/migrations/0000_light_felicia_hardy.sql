CREATE TABLE `workflow_defs` (
	`id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`reference` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`content_hash` text NOT NULL,
	`project_id` text,
	`library_id` text,
	`input_schema` text NOT NULL,
	`output_schema` text NOT NULL,
	`output_mapping` text,
	`context_schema` text,
	`initial_node_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_reference` ON `workflow_defs` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_scope` ON `workflow_defs` (`project_id`,`library_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_workflow_defs_version` ON `workflow_defs` (`reference`,`version`,`project_id`,`library_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_workflow_defs_content` ON `workflow_defs` (`reference`,`content_hash`,`project_id`,`library_id`);--> statement-breakpoint
CREATE TABLE `fan_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`fan_in_path` text NOT NULL,
	`status` text NOT NULL,
	`transition_id` text NOT NULL,
	`first_arrival_at` integer NOT NULL,
	`activated_at` integer,
	`activated_by_token_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_fan_ins_workflow_run` ON `fan_ins` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_fan_ins_path` ON `fan_ins` (`fan_in_path`);--> statement-breakpoint
CREATE INDEX `idx_fan_ins_unique_path` ON `fan_ins` (`workflow_run_id`,`fan_in_path`);--> statement-breakpoint
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
	FOREIGN KEY (`definition_id`,`definition_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_nodes_definition` ON `nodes` (`definition_id`,`definition_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_task` ON `nodes` (`task_id`,`task_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_ref` ON `nodes` (`definition_id`,`definition_version`,`ref`);--> statement-breakpoint
CREATE TABLE `subworkflows` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`parent_token_id` text NOT NULL,
	`subworkflow_run_id` text NOT NULL,
	`status` text NOT NULL,
	`timeout_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subworkflows_workflow_run` ON `subworkflows` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_subworkflows_parent_token` ON `subworkflows` (`parent_token_id`);--> statement-breakpoint
CREATE INDEX `idx_subworkflows_status` ON `subworkflows` (`status`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`status` text NOT NULL,
	`parent_token_id` text,
	`path_id` text NOT NULL,
	`sibling_group` text,
	`branch_index` integer NOT NULL,
	`branch_total` integer NOT NULL,
	`iteration_counts` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`arrived_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_tokens_workflow_run` ON `tokens` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_tokens_status` ON `tokens` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tokens_siblingGroup` ON `tokens` (`sibling_group`);--> statement-breakpoint
CREATE INDEX `idx_tokens_path` ON `tokens` (`path_id`);--> statement-breakpoint
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
	FOREIGN KEY (`definition_id`,`definition_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`,`definition_version`,`from_node_id`) REFERENCES `nodes`(`definition_id`,`definition_version`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`,`definition_version`,`to_node_id`) REFERENCES `nodes`(`definition_id`,`definition_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transitions_definition` ON `transitions` (`definition_id`,`definition_version`);--> statement-breakpoint
CREATE INDEX `idx_transitions_from_node` ON `transitions` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_to_node` ON `transitions` (`to_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_ref` ON `transitions` (`definition_id`,`definition_version`,`ref`);--> statement-breakpoint
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
	FOREIGN KEY (`definition_id`,`definition_version`,`parent_node_id`) REFERENCES `nodes`(`definition_id`,`definition_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_project` ON `workflow_runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_root` ON `workflow_runs` (`root_run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_parent` ON `workflow_runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_created_at` ON `workflow_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `workflow_status` (
	`workflow_run_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL
);
