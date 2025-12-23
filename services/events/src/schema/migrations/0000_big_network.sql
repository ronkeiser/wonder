CREATE TABLE `trace_events` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`root_run_id` text NOT NULL,
	`token_id` text,
	`node_id` text,
	`project_id` text NOT NULL,
	`duration_ms` real,
	`payload` text NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `idx_trace_events_workflow_sequence` ON `trace_events` (`workflow_run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_root_run_id` ON `trace_events` (`root_run_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_type` ON `trace_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_category` ON `trace_events` (`category`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_token` ON `trace_events` (`token_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_project` ON `trace_events` (`project_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_duration` ON `trace_events` (`duration_ms`);--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`root_run_id` text NOT NULL,
	`workflow_def_id` text NOT NULL,
	`node_id` text,
	`token_id` text,
	`path_id` text,
	`project_id` text NOT NULL,
	`tokens` integer,
	`cost_usd` real,
	`message` text,
	`metadata` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `workflow_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_event_type` ON `workflow_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_events_workflow_run_id` ON `workflow_events` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_events_root_run_id` ON `workflow_events` (`root_run_id`);--> statement-breakpoint
CREATE INDEX `idx_events_project_id` ON `workflow_events` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_events_node_id` ON `workflow_events` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_events_token_id` ON `workflow_events` (`token_id`);--> statement-breakpoint
CREATE INDEX `idx_events_sequence` ON `workflow_events` (`workflow_run_id`,`sequence`);