-- Agent DO SQLite Initial Migration
-- Creates tables for ConversationRunner state management

-- Conversation metadata (single row, cached from D1)
CREATE TABLE `conversation_meta` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `participants` text NOT NULL,
  `status` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- Agent definition (single row, cached from D1)
CREATE TABLE `agent_def` (
  `id` text PRIMARY KEY NOT NULL,
  `project_ids` text NOT NULL,
  `persona_id` text,
  `persona_version` integer
);

-- Persona definition (single row, cached from D1)
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

-- Tool definitions (multiple rows, cached from D1)
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

-- Turns track one unit of agent work within a conversation
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

CREATE INDEX `idx_turns_conversation` ON `turns` (`conversation_id`);
CREATE INDEX `idx_turns_status` ON `turns` (`status`);

-- Messages are user or agent utterances
CREATE TABLE `messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`);
CREATE INDEX `idx_messages_turn` ON `messages` (`turn_id`);

-- Moves record each iteration within a turn
CREATE TABLE `moves` (
  `id` text PRIMARY KEY NOT NULL,
  `turn_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `reasoning` text,
  `tool_call_id` text,
  `tool_id` text,
  `tool_input` text,
  `tool_result` text,
  `raw` text,
  `created_at` integer NOT NULL
);

CREATE INDEX `idx_moves_turn` ON `moves` (`turn_id`);
CREATE INDEX `idx_moves_sequence` ON `moves` (`turn_id`, `sequence`);

-- Async operations pending on a turn
CREATE TABLE `async_ops` (
  `id` text PRIMARY KEY NOT NULL,
  `turn_id` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `status` text NOT NULL,
  `result` text,
  `created_at` integer NOT NULL,
  `completed_at` integer
);

CREATE INDEX `idx_async_ops_turn` ON `async_ops` (`turn_id`);
CREATE INDEX `idx_async_ops_status` ON `async_ops` (`status`);
