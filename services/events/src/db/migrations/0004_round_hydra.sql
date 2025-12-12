DROP INDEX `idx_trace_events_workspace`;--> statement-breakpoint
CREATE INDEX `idx_trace_events_project` ON `trace_events` (`project_id`,`timestamp`);--> statement-breakpoint
ALTER TABLE `trace_events` DROP COLUMN `workspace_id`;--> statement-breakpoint
DROP INDEX `idx_events_workspace_id`;--> statement-breakpoint
ALTER TABLE `workflow_events` DROP COLUMN `workspace_id`;