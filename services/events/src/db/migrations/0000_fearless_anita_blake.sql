CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`sequence_number` integer NOT NULL,
	`event_type` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`parent_run_id` text,
	`workflow_def_id` text,
	`node_id` text,
	`token_id` text,
	`path_id` text,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`tokens` integer,
	`cost_usd` real,
	`message` text,
	`metadata` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_event_type` ON `events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_events_workflow_run_id` ON `events` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_events_parent_run_id` ON `events` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_events_workspace_id` ON `events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_events_project_id` ON `events` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_events_node_id` ON `events` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_events_sequence` ON `events` (`workflow_run_id`,`sequence_number`);