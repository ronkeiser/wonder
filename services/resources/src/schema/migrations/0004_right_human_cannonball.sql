ALTER TABLE `workflow_defs` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_content_hash` ON `workflow_defs` (`name`,`project_id`,`library_id`,`content_hash`);