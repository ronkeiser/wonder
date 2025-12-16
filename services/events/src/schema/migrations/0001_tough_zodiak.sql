ALTER TABLE `events` RENAME TO `workflow_events`;--> statement-breakpoint
CREATE TABLE `introspection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`token_id` text,
	`node_id` text,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`duration_ms` real,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_introspection_workflow_sequence` ON `introspection_events` (`workflow_run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_introspection_type` ON `introspection_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_introspection_category` ON `introspection_events` (`category`);--> statement-breakpoint
CREATE INDEX `idx_introspection_token` ON `introspection_events` (`token_id`);--> statement-breakpoint
CREATE INDEX `idx_introspection_workspace` ON `introspection_events` (`workspace_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_introspection_duration` ON `introspection_events` (`duration_ms`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workflow_events` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`sequence_number` integer NOT NULL,
	`event_type` text NOT NULL,
	`workflow_run_id` text NOT NULL,
	`parent_run_id` text,
	`workflow_def_id` text NOT NULL,
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
INSERT INTO `__new_workflow_events`("id", "timestamp", "sequence_number", "event_type", "workflow_run_id", "parent_run_id", "workflow_def_id", "node_id", "token_id", "path_id", "workspace_id", "project_id", "tokens", "cost_usd", "message", "metadata") SELECT "id", "timestamp", "sequence_number", "event_type", "workflow_run_id", "parent_run_id", "workflow_def_id", "node_id", "token_id", "path_id", "workspace_id", "project_id", "tokens", "cost_usd", "message", "metadata" FROM `workflow_events`;--> statement-breakpoint
DROP TABLE `workflow_events`;--> statement-breakpoint
ALTER TABLE `__new_workflow_events` RENAME TO `workflow_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `workflow_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_event_type` ON `workflow_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_events_workflow_run_id` ON `workflow_events` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_events_parent_run_id` ON `workflow_events` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `idx_events_workspace_id` ON `workflow_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_events_project_id` ON `workflow_events` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_events_node_id` ON `workflow_events` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_events_token_id` ON `workflow_events` (`token_id`);--> statement-breakpoint
CREATE INDEX `idx_events_sequence` ON `workflow_events` (`workflow_run_id`,`sequence_number`);