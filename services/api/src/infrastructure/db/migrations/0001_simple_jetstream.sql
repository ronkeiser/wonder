CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text,
	`metadata` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`);--> statement-breakpoint
CREATE INDEX `idx_logs_event_type` ON `logs` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_logs_timestamp` ON `logs` (`timestamp`);