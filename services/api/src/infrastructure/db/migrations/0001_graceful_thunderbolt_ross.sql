PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type_id` text NOT NULL,
	`type_version` integer NOT NULL,
	`content` text NOT NULL,
	`created_by_workflow_run_id` text,
	`created_by_workflow_def_id` text,
	`created_by_workflow_def_version` integer,
	`created_by_node_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_workflow_def_id`,`created_by_workflow_def_version`,`created_by_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_artifacts`("id", "project_id", "type_id", "type_version", "content", "created_by_workflow_run_id", "created_by_workflow_def_id", "created_by_workflow_def_version", "created_by_node_id", "created_at") SELECT "id", "project_id", "type_id", "type_version", "content", "created_by_workflow_run_id", "created_by_workflow_def_id", "created_by_workflow_def_version", "created_by_node_id", "created_at" FROM `artifacts`;--> statement-breakpoint
DROP TABLE `artifacts`;--> statement-breakpoint
ALTER TABLE `__new_artifacts` RENAME TO `artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_artifacts_project_type` ON `artifacts` (`project_id`,`type_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_workflow_run` ON `artifacts` (`created_by_workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_created_at` ON `artifacts` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_def_id` text NOT NULL,
	`workflow_def_version` integer NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`priority` integer NOT NULL,
	`condition` text,
	`foreach` text,
	`loop_config` text,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`,`from_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`,`to_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_transitions`("id", "workflow_def_id", "workflow_def_version", "from_node_id", "to_node_id", "priority", "condition", "foreach", "loop_config") SELECT "id", "workflow_def_id", "workflow_def_version", "from_node_id", "to_node_id", "priority", "condition", "foreach", "loop_config" FROM `transitions`;--> statement-breakpoint
DROP TABLE `transitions`;--> statement-breakpoint
ALTER TABLE `__new_transitions` RENAME TO `transitions`;--> statement-breakpoint
CREATE INDEX `idx_transitions_workflow_def` ON `transitions` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_transitions_from_node` ON `transitions` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_to_node` ON `transitions` (`to_node_id`);--> statement-breakpoint
CREATE TABLE `__new_workflow_runs` (
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
	FOREIGN KEY (`workflow_def_id`,`workflow_version`,`parent_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_workflow_runs`("id", "project_id", "workflow_id", "workflow_def_id", "workflow_version", "status", "context", "active_tokens", "durable_object_id", "latest_snapshot", "parent_run_id", "parent_node_id", "created_at", "updated_at", "completed_at") SELECT "id", "project_id", "workflow_id", "workflow_def_id", "workflow_version", "status", "context", "active_tokens", "durable_object_id", "latest_snapshot", "parent_run_id", "parent_node_id", "created_at", "updated_at", "completed_at" FROM `workflow_runs`;--> statement-breakpoint
DROP TABLE `workflow_runs`;--> statement-breakpoint
ALTER TABLE `__new_workflow_runs` RENAME TO `workflow_runs`;--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_project` ON `workflow_runs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_parent` ON `workflow_runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_created_at` ON `workflow_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_nodes` (
	`id` text NOT NULL,
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
	PRIMARY KEY(`workflow_def_id`, `workflow_def_version`, `id`),
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_nodes`("id", "workflow_def_id", "workflow_def_version", "name", "action_id", "input_mapping", "output_mapping", "fan_out", "fan_in", "joins_node", "merge", "on_early_complete") SELECT "id", "workflow_def_id", "workflow_def_version", "name", "action_id", "input_mapping", "output_mapping", "fan_out", "fan_in", "joins_node", "merge", "on_early_complete" FROM `nodes`;--> statement-breakpoint
DROP TABLE `nodes`;--> statement-breakpoint
ALTER TABLE `__new_nodes` RENAME TO `nodes`;--> statement-breakpoint
CREATE INDEX `idx_nodes_workflow_def` ON `nodes` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_action` ON `nodes` (`action_id`);