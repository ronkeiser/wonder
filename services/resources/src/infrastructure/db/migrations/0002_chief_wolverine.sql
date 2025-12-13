CREATE TABLE `task_defs` (
	`id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`project_id` text,
	`library_id` text,
	`tags` text,
	`input_schema` text NOT NULL,
	`output_schema` text NOT NULL,
	`steps` text NOT NULL,
	`retry` text,
	`timeout_ms` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_task_defs_project` ON `task_defs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_task_defs_library` ON `task_defs` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_task_defs_name_version` ON `task_defs` (`name`,`project_id`,`library_id`,`version`);--> statement-breakpoint
DROP INDEX `idx_nodes_action`;--> statement-breakpoint
ALTER TABLE `nodes` ADD `task_id` text;--> statement-breakpoint
ALTER TABLE `nodes` ADD `task_version` integer;--> statement-breakpoint
ALTER TABLE `nodes` ADD `resource_bindings` text;--> statement-breakpoint
CREATE INDEX `idx_nodes_task` ON `nodes` (`task_id`,`task_version`);--> statement-breakpoint
ALTER TABLE `nodes` DROP COLUMN `action_id`;--> statement-breakpoint
ALTER TABLE `nodes` DROP COLUMN `action_version`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workflow_defs` (
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
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_workflow_defs`("id", "name", "description", "version", "project_id", "library_id", "tags", "input_schema", "output_schema", "output_mapping", "context_schema", "initial_node_id", "created_at", "updated_at") SELECT "id", "name", "description", "version", "project_id", "library_id", "tags", "input_schema", "output_schema", "output_mapping", "context_schema", "initial_node_id", "created_at", "updated_at" FROM `workflow_defs`;--> statement-breakpoint
DROP TABLE `workflow_defs`;--> statement-breakpoint
ALTER TABLE `__new_workflow_defs` RENAME TO `workflow_defs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_project` ON `workflow_defs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_library` ON `workflow_defs` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_name_version` ON `workflow_defs` (`name`,`project_id`,`library_id`,`version`);