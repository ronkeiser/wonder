ALTER TABLE `nodes` ADD `ref` text NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_nodes_ref` ON `nodes` (`workflow_def_id`,`workflow_def_version`,`ref`);--> statement-breakpoint
ALTER TABLE `transitions` ADD `ref` text;--> statement-breakpoint
CREATE INDEX `idx_transitions_ref` ON `transitions` (`workflow_def_id`,`workflow_def_version`,`ref`);