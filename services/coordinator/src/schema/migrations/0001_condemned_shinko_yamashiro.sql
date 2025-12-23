CREATE TABLE `child_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`parent_token_id` text NOT NULL,
	`child_run_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_child_workflows_workflow_run` ON `child_workflows` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_child_workflows_parent_token` ON `child_workflows` (`parent_token_id`);--> statement-breakpoint
CREATE INDEX `idx_child_workflows_status` ON `child_workflows` (`status`);--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `parent_token_id` text;