ALTER TABLE `model_profiles` ADD `content_hash` text;--> statement-breakpoint
CREATE INDEX `idx_model_profiles_name_hash` ON `model_profiles` (`name`,`content_hash`);