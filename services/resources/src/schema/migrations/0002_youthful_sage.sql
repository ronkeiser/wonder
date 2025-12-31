CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_ids` text NOT NULL,
	`persona_id` text,
	`persona_version` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_persona` ON `agents` (`persona_id`,`persona_version`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`participants` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_status` ON `conversations` (`status`);--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`library_id` text,
	`system_prompt` text NOT NULL,
	`model_profile_id` text NOT NULL,
	`context_assembly_workflow_id` text NOT NULL,
	`memory_extraction_workflow_id` text NOT NULL,
	`recent_turns_limit` integer DEFAULT 20 NOT NULL,
	`tool_ids` text NOT NULL,
	`constraints` text,
	`content_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_profile_id`) REFERENCES `model_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_personas_library` ON `personas` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_personas_name_version` ON `personas` (`name`,`library_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_personas_content_hash` ON `personas` (`name`,`library_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `tools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`library_id` text,
	`input_schema` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`async` integer DEFAULT false NOT NULL,
	`invocation_mode` text,
	`input_mapping` text,
	`retry` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tools_library` ON `tools` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_tools_name` ON `tools` (`name`,`library_id`);--> statement-breakpoint
CREATE INDEX `idx_tools_target` ON `tools` (`target_type`,`target_id`);