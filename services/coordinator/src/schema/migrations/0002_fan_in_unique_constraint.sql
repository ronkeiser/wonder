-- Add unique constraint for race-safe fan-in activation
-- and track which token triggered the activation
ALTER TABLE `fan_ins` ADD `activated_by_token_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fan_ins_unique_path` ON `fan_ins` (`workflow_run_id`, `fan_in_path`);
