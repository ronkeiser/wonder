-- Migration: Remove template_language column from prompt_specs
--
-- This column was originally designed to support multiple templating languages
-- (handlebars, jinja2), but we exclusively use @wonder/templates for all templating.
-- The column is no longer needed and can be safely removed.

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Step 1: Create new table without template_language
CREATE TABLE `prompt_specs_new` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer NOT NULL,
	`system_prompt` text,
	`template` text NOT NULL,
	`requires` text NOT NULL,
	`produces` text NOT NULL,
	`examples` text,
	`tags` text,
	`content_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);

-- Step 2: Copy data (excluding template_language)
INSERT INTO `prompt_specs_new` (`id`, `name`, `description`, `version`, `system_prompt`, `template`, `requires`, `produces`, `examples`, `tags`, `content_hash`, `created_at`, `updated_at`)
SELECT `id`, `name`, `description`, `version`, `system_prompt`, `template`, `requires`, `produces`, `examples`, `tags`, `content_hash`, `created_at`, `updated_at`
FROM `prompt_specs`;

-- Step 3: Drop old table
DROP TABLE `prompt_specs`;

-- Step 4: Rename new table
ALTER TABLE `prompt_specs_new` RENAME TO `prompt_specs`;

-- Step 5: Recreate index
CREATE INDEX `idx_prompt_specs_content_hash` ON `prompt_specs` (`name`,`content_hash`);
