DROP INDEX `idx_model_profiles_name_hash`;--> statement-breakpoint
ALTER TABLE `model_profiles` ADD `reference` text;--> statement-breakpoint
CREATE INDEX `idx_model_profiles_reference_hash` ON `model_profiles` (`reference`,`content_hash`);--> statement-breakpoint
DROP INDEX `idx_personas_name_version`;--> statement-breakpoint
DROP INDEX `idx_personas_content_hash`;--> statement-breakpoint
ALTER TABLE `personas` ADD `reference` text;--> statement-breakpoint
CREATE INDEX `idx_personas_reference_version` ON `personas` (`reference`,`library_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_personas_content_hash` ON `personas` (`reference`,`library_id`,`content_hash`);--> statement-breakpoint
DROP INDEX `idx_tasks_name_version`;--> statement-breakpoint
DROP INDEX `idx_tasks_content_hash`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reference` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_reference_version` ON `tasks` (`reference`,`project_id`,`library_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_tasks_content_hash` ON `tasks` (`reference`,`project_id`,`library_id`,`content_hash`);--> statement-breakpoint
DROP INDEX `idx_workflow_defs_name_version`;--> statement-breakpoint
DROP INDEX `idx_workflow_defs_content_hash`;--> statement-breakpoint
ALTER TABLE `workflow_defs` ADD `reference` text;--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_reference_version` ON `workflow_defs` (`reference`,`project_id`,`library_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_workflow_defs_content_hash` ON `workflow_defs` (`reference`,`project_id`,`library_id`,`content_hash`);--> statement-breakpoint
DROP INDEX `idx_actions_content_hash`;--> statement-breakpoint
ALTER TABLE `actions` ADD `reference` text;--> statement-breakpoint
CREATE INDEX `idx_actions_reference_version` ON `actions` (`reference`,`version`);--> statement-breakpoint
CREATE INDEX `idx_actions_content_hash` ON `actions` (`reference`,`content_hash`);