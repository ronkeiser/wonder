CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`sequence` integer NOT NULL,
	`stream_id` text NOT NULL,
	`execution_id` text NOT NULL,
	`execution_type` text NOT NULL,
	`event_type` text NOT NULL,
	`project_id` text NOT NULL,
	`message` text,
	`metadata` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_event_type` ON `events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_events_stream_id` ON `events` (`stream_id`);--> statement-breakpoint
CREATE INDEX `idx_events_execution_id` ON `events` (`execution_id`);--> statement-breakpoint
CREATE INDEX `idx_events_execution_type` ON `events` (`execution_type`);--> statement-breakpoint
CREATE INDEX `idx_events_project_id` ON `events` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_events_sequence` ON `events` (`stream_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `trace_events` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`stream_id` text NOT NULL,
	`execution_id` text NOT NULL,
	`execution_type` text NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`project_id` text NOT NULL,
	`duration_ms` real,
	`payload` text NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `idx_trace_events_stream_sequence` ON `trace_events` (`stream_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_execution_id` ON `trace_events` (`execution_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_execution_type` ON `trace_events` (`execution_type`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_type` ON `trace_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_category` ON `trace_events` (`category`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_project` ON `trace_events` (`project_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_duration` ON `trace_events` (`duration_ms`);