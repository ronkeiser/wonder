ALTER TABLE `task_defs` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
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
	`content_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "version", "name", "description", "project_id", "library_id", "tags", "input_schema", "output_schema", "steps", "retry", "timeout_ms", "content_hash", "created_at", "updated_at") SELECT "id", "version", "name", "description", "project_id", "library_id", "tags", "input_schema", "output_schema", "steps", "retry", "timeout_ms", "content_hash", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_library` ON `tasks` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_name_version` ON `tasks` (`name`,`project_id`,`library_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_tasks_content_hash` ON `tasks` (`name`,`project_id`,`library_id`,`content_hash`);--> statement-breakpoint
ALTER TABLE `actions` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `idx_actions_content_hash` ON `actions` (`name`,`content_hash`);--> statement-breakpoint
ALTER TABLE `artifact_types` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `artifact_types` ADD `created_at` text NOT NULL;--> statement-breakpoint
ALTER TABLE `artifact_types` ADD `updated_at` text NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_artifact_types_content_hash` ON `artifact_types` (`name`,`content_hash`);--> statement-breakpoint
ALTER TABLE `prompt_specs` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `idx_prompt_specs_content_hash` ON `prompt_specs` (`name`,`content_hash`);