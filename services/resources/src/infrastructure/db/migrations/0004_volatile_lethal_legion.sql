DROP INDEX `idx_workflow_defs_owner`;--> statement-breakpoint
DROP INDEX `idx_workflow_defs_name_version`;--> statement-breakpoint
ALTER TABLE `workflow_defs` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `workflow_defs` ADD `library_id` text;--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_project` ON `workflow_defs` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_library` ON `workflow_defs` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_name_version` ON `workflow_defs` (`name`,`project_id`,`library_id`,`version`);--> statement-breakpoint
ALTER TABLE `workflow_defs` DROP COLUMN `owner_type`;--> statement-breakpoint
ALTER TABLE `workflow_defs` DROP COLUMN `owner_id`;