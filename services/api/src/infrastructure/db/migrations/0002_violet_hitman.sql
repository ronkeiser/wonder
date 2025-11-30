PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transitions` (
	`id` text NOT NULL,
	`workflow_def_id` text NOT NULL,
	`workflow_def_version` integer NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`priority` integer NOT NULL,
	`condition` text,
	`foreach` text,
	`loop_config` text,
	PRIMARY KEY(`workflow_def_id`, `workflow_def_version`, `id`),
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`,`from_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`,`to_node_id`) REFERENCES `nodes`(`workflow_def_id`,`workflow_def_version`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_transitions`("id", "workflow_def_id", "workflow_def_version", "from_node_id", "to_node_id", "priority", "condition", "foreach", "loop_config") SELECT "id", "workflow_def_id", "workflow_def_version", "from_node_id", "to_node_id", "priority", "condition", "foreach", "loop_config" FROM `transitions`;--> statement-breakpoint
DROP TABLE `transitions`;--> statement-breakpoint
ALTER TABLE `__new_transitions` RENAME TO `transitions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_transitions_workflow_def` ON `transitions` (`workflow_def_id`,`workflow_def_version`);--> statement-breakpoint
CREATE INDEX `idx_transitions_from_node` ON `transitions` (`from_node_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_to_node` ON `transitions` (`to_node_id`);