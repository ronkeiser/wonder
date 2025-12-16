CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`level` text NOT NULL,
	`service` text NOT NULL,
	`environment` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text,
	`source_location` text,
	`trace_id` text,
	`request_id` text,
	`workspace_id` text,
	`project_id` text,
	`user_id` text,
	`version` text,
	`instance_id` text,
	`metadata` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_logs_service` ON `logs` (`service`);--> statement-breakpoint
CREATE INDEX `idx_logs_environment` ON `logs` (`environment`);--> statement-breakpoint
CREATE INDEX `idx_logs_event_type` ON `logs` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_logs_trace_id` ON `logs` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_logs_request_id` ON `logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_logs_workspace_id` ON `logs` (`workspace_id`);