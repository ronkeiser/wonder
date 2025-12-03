CREATE TABLE `project_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`default_model_profile_id` text,
	`rate_limit_max_concurrent_runs` integer,
	`rate_limit_max_llm_calls_per_hour` integer,
	`budget_max_monthly_spend_cents` integer,
	`budget_alert_threshold_cents` integer,
	`snapshot_policy_every_n_events` integer,
	`snapshot_policy_every_n_seconds` integer,
	`snapshot_policy_on_fan_in_complete` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`allowed_model_providers` text,
	`allowed_mcp_servers` text,
	`budget_max_monthly_spend_cents` integer,
	`budget_alert_threshold_cents` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `logs`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `settings`;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `settings`;