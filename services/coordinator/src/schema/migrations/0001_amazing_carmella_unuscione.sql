DROP INDEX `idx_tokens_fan_out`;--> statement-breakpoint
ALTER TABLE `tokens` DROP COLUMN `fan_out_transition_id`;--> statement-breakpoint
ALTER TABLE `workflow_defs` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_content_hash` ON `workflow_defs` (`name`,`project_id`,`library_id`,`content_hash`);