DROP INDEX `idx_nodes_action`;--> statement-breakpoint
ALTER TABLE `nodes` ADD `task_id` text;--> statement-breakpoint
ALTER TABLE `nodes` ADD `task_version` integer;--> statement-breakpoint
ALTER TABLE `nodes` ADD `resource_bindings` text;--> statement-breakpoint
CREATE INDEX `idx_nodes_task` ON `nodes` (`task_id`,`task_version`);--> statement-breakpoint
ALTER TABLE `nodes` DROP COLUMN `action_id`;--> statement-breakpoint
ALTER TABLE `nodes` DROP COLUMN `action_version`;