PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workflow_defs` (
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
	`initial_node_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
INSERT INTO `__new_workflow_defs`("id", "name", "description", "version", "owner_type", "owner_id", "tags", "input_schema", "output_schema", "context_schema", "initial_node_id", "created_at", "updated_at") SELECT "id", "name", "description", "version", "owner_type", "owner_id", "tags", "input_schema", "output_schema", "context_schema", "initial_node_id", "created_at", "updated_at" FROM `workflow_defs`;--> statement-breakpoint
DROP TABLE `workflow_defs`;--> statement-breakpoint
ALTER TABLE `__new_workflow_defs` RENAME TO `workflow_defs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_owner` ON `workflow_defs` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_name_version` ON `workflow_defs` (`name`,`owner_type`,`owner_id`,`version`);