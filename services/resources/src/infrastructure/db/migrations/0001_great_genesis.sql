PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_nodes` (
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
INSERT INTO `__new_nodes`("id", "ref", "workflow_def_id", "workflow_def_version", "name", "action_id", "action_version", "input_mapping", "output_mapping") SELECT "id", "ref", "workflow_def_id", "workflow_def_version", "name", "action_id", "action_version", "input_mapping", "output_mapping" FROM `nodes`;--> statement-breakpoint
DROP TABLE `nodes`;--> statement-breakpoint
ALTER TABLE `__new_nodes` RENAME TO `nodes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_nodes_workflow_def` ON `nodes` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_action` ON `nodes` (`action_id`,`action_version`);--> statement-breakpoint
CREATE INDEX `idx_nodes_ref` ON `nodes` (`workflow_def_id`,`workflow_def_version`,`ref`);