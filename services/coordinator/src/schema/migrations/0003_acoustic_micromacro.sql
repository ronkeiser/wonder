DROP INDEX `idx_workflow_defs_name_version`;--> statement-breakpoint
DROP INDEX `idx_workflow_defs_content_hash`;--> statement-breakpoint
ALTER TABLE `workflow_defs` ADD `reference` text;--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_reference_version` ON `workflow_defs` (`reference`,`project_id`,`library_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_content_hash` ON `workflow_defs` (`reference`,`project_id`,`library_id`,`content_hash`);