CREATE TABLE `fan_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`fan_in_path` text NOT NULL,
	`status` text NOT NULL,
	`transition_id` text NOT NULL,
	`first_arrival_at` integer NOT NULL,
	`activated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_fan_ins_workflow_run` ON `fan_ins` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_fan_ins_path` ON `fan_ins` (`fan_in_path`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text NOT NULL,
	`ref` text NOT NULL,
	`workflow_def_id` text NOT NULL,
	`workflow_def_version` integer NOT NULL,
	`name` text NOT NULL,
	`action_id` text,
	`action_version` integer,
	`input_mapping` text,
	`output_mapping` text,
	PRIMARY KEY(`workflow_def_id`, `workflow_def_version`, `id`),
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_nodes_workflow_def` ON `nodes` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_action` ON `nodes` (`action_id`,`action_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_ref` ON `nodes` (`workflow_def_id`,`workflow_def_version`,`ref`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`node_id` text NOT NULL,
	`status` text NOT NULL,
	`parent_token_id` text,
	`path_id` text NOT NULL,
	`fan_out_transition_id` text,
	`branch_index` integer NOT NULL,
	`branch_total` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`arrived_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_tokens_workflow_run` ON `tokens` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_tokens_status` ON `tokens` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tokens_fan_out` ON `tokens` (`fan_out_transition_id`);--> statement-breakpoint
CREATE INDEX `idx_tokens_path` ON `tokens` (`path_id`);--> statement-breakpoint
CREATE TABLE `transitions` (
	`id` text NOT NULL,
	`ref` text,
	`workflow_def_id` text NOT NULL,
	`workflow_def_version` integer NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`priority` integer NOT NULL,
	`condition` text,
	`spawn_count` integer,
	`foreach` text,
	`synchronization` text,
	`loop_config` text,
	PRIMARY KEY(`workflow_def_id`, `workflow_def_version`, `id`),
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`,`from_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`,`to_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transitions_workflow_def` ON `transitions` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_transitions_from_node` ON `transitions` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_to_node` ON `transitions` (`to_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_ref` ON `transitions` (`workflow_def_id`,`workflow_def_version`,`ref`);--> statement-breakpoint
CREATE TABLE `workflow_defs` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`project_id` text,
	`library_id` text,
	`tags` text,
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
CREATE INDEX `idx_workflow_defs_project` ON `workflow_defs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_library` ON `workflow_defs` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_name_version` ON `workflow_defs` (`name`,`project_id`,`library_id`,`version`);--> statement-breakpoint
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
	FOREIGN KEY (`workflow_def_id`,`workflow_version`,`parent_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_project` ON `workflow_runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_parent` ON `workflow_runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_created_at` ON `workflow_runs` (`created_at`);