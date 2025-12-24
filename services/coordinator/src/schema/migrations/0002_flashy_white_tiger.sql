ALTER TABLE `child_workflows` RENAME TO `subworkflows`;--> statement-breakpoint
ALTER TABLE `subworkflows` RENAME COLUMN "child_run_id" TO "subworkflow_run_id";--> statement-breakpoint
DROP INDEX `idx_child_workflows_workflow_run`;--> statement-breakpoint
DROP INDEX `idx_child_workflows_parent_token`;--> statement-breakpoint
DROP INDEX `idx_child_workflows_status`;--> statement-breakpoint
CREATE INDEX `idx_subworkflows_workflow_run` ON `subworkflows` (`workflow_run_id`);--> statement-breakpoint
CREATE INDEX `idx_subworkflows_parent_token` ON `subworkflows` (`parent_token_id`);--> statement-breakpoint
CREATE INDEX `idx_subworkflows_status` ON `subworkflows` (`status`);