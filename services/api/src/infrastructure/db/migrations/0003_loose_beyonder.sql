PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`workflow_run_id` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`timestamp` text NOT NULL,
	`archived_at` text,
	PRIMARY KEY(`workflow_run_id`, `sequence_number`),
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_events`("workflow_run_id", "sequence_number", "kind", "payload", "timestamp", "archived_at") SELECT "workflow_run_id", "sequence_number", "kind", "payload", "timestamp", "archived_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_kind` ON `events` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_events_archived_at` ON `events` (`archived_at`);