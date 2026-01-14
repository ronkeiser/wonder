CREATE TABLE `agent_def` (
	`id` text PRIMARY KEY NOT NULL,
	`project_ids` text NOT NULL,
	`persona_id` text,
	`persona_version` integer
);
--> statement-breakpoint
CREATE TABLE `async_ops` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`timeout_at` integer,
	`attempt_number` integer DEFAULT 1,
	`max_attempts` integer DEFAULT 1,
	`backoff_ms` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_async_ops_turn` ON `async_ops` (`turn_id`);--> statement-breakpoint
CREATE INDEX `idx_async_ops_status` ON `async_ops` (`status`);--> statement-breakpoint
CREATE INDEX `idx_async_ops_timeout` ON `async_ops` (`timeout_at`);--> statement-breakpoint
CREATE TABLE `conversation_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`participants` text NOT NULL,
	`status` text NOT NULL,
	`branch_context` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_turn` ON `messages` (`turn_id`);--> statement-breakpoint
CREATE TABLE `moves` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`reasoning` text,
	`tool_call_id` text,
	`tool_id` text,
	`tool_input` text,
	`tool_result` text,
	`raw_content` text,
	`raw` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_moves_turn` ON `moves` (`turn_id`);--> statement-breakpoint
CREATE INDEX `idx_moves_sequence` ON `moves` (`turn_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`participant_type` text NOT NULL,
	`participant_id` text NOT NULL,
	`added_at` integer NOT NULL,
	`added_by_turn_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_participants_conversation` ON `participants` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_participants_type` ON `participants` (`participant_type`);--> statement-breakpoint
CREATE TABLE `persona_def` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`model_profile_id` text NOT NULL,
	`context_assembly_workflow_id` text NOT NULL,
	`memory_extraction_workflow_id` text NOT NULL,
	`recent_turns_limit` integer NOT NULL,
	`tool_ids` text NOT NULL,
	`constraints` text
);
--> statement-breakpoint
CREATE TABLE `tool_defs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`input_schema` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`async` integer NOT NULL,
	`invocation_mode` text,
	`input_mapping` text
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`caller_type` text NOT NULL,
	`caller_user_id` text,
	`caller_run_id` text,
	`caller_agent_id` text,
	`caller_turn_id` text,
	`input` text,
	`reply_to_message_id` text,
	`status` text NOT NULL,
	`context_assembly_run_id` text,
	`memory_extraction_run_id` text,
	`memory_extraction_failed` integer,
	`tool_failure_count` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_turns_conversation` ON `turns` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_turns_status` ON `turns` (`status`);