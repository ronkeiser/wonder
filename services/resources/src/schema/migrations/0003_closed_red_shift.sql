DROP TABLE IF EXISTS `agents`;--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project_ids` text NOT NULL,
	`persona_id` text,
	`persona_version` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_agents_persona` ON `agents` (`persona_id`,`persona_version`);
