ALTER TABLE `introspection_events` RENAME TO `trace_events`;--> statement-breakpoint
DROP INDEX `idx_introspection_workflow_sequence`;--> statement-breakpoint
DROP INDEX `idx_introspection_type`;--> statement-breakpoint
DROP INDEX `idx_introspection_category`;--> statement-breakpoint
DROP INDEX `idx_introspection_token`;--> statement-breakpoint
DROP INDEX `idx_introspection_workspace`;--> statement-breakpoint
DROP INDEX `idx_introspection_duration`;--> statement-breakpoint
CREATE INDEX `idx_trace_events_workflow_sequence` ON `trace_events` (`workflow_run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_type` ON `trace_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_category` ON `trace_events` (`category`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_token` ON `trace_events` (`token_id`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_workspace` ON `trace_events` (`workspace_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_trace_events_duration` ON `trace_events` (`duration_ms`);