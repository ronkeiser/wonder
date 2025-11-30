PRAGMA foreign_keys=OFF;
-- Update actions first (no FK dependencies)
CREATE TABLE `__new_actions` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`implementation` text NOT NULL,
	`requires` text,
	`produces` text,
	`execution` text,
	`idempotency` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
INSERT INTO `__new_actions`("id", "name", "description", "version", "kind", "implementation", "requires", "produces", "execution", "idempotency", "created_at", "updated_at") SELECT "id", "name", "description", "version", "kind", "implementation", "requires", "produces", "execution", "idempotency", "created_at", "updated_at" FROM `actions`;
DROP TABLE `actions`;
ALTER TABLE `__new_actions` RENAME TO `actions`;

-- Update prompt_specs (no FK dependencies)
CREATE TABLE `__new_prompt_specs` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer NOT NULL,
	`system_prompt` text,
	`template` text NOT NULL,
	`template_language` text NOT NULL,
	`requires` text NOT NULL,
	`produces` text NOT NULL,
	`examples` text,
	`tags` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
INSERT INTO `__new_prompt_specs`("id", "name", "description", "version", "system_prompt", "template", "template_language", "requires", "produces", "examples", "tags", "created_at", "updated_at") SELECT "id", "name", "description", "version", "system_prompt", "template", "template_language", "requires", "produces", "examples", "tags", "created_at", "updated_at" FROM `prompt_specs`;
DROP TABLE `prompt_specs`;
ALTER TABLE `__new_prompt_specs` RENAME TO `prompt_specs`;

-- Now update nodes (depends on actions composite PK)
DROP TABLE `nodes`;
CREATE TABLE `nodes` (
	`id` text NOT NULL,
	`workflow_def_id` text NOT NULL,
	`workflow_def_version` integer NOT NULL,
	`name` text NOT NULL,
	`action_id` text NOT NULL,
	`action_version` integer NOT NULL,
	`input_mapping` text,
	`output_mapping` text,
	`fan_out` text NOT NULL,
	`fan_in` text NOT NULL,
	`joins_node` text,
	`merge` text,
	`on_early_complete` text,
	PRIMARY KEY(`workflow_def_id`, `workflow_def_version`, `id`),
	FOREIGN KEY (`workflow_def_id`,`workflow_def_version`) REFERENCES `workflow_defs`(`id`,`version`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`action_id`,`action_version`) REFERENCES `actions`(`id`,`version`) ON UPDATE no action ON DELETE no action
);

PRAGMA foreign_keys=ON;
CREATE INDEX `idx_nodes_workflow_def` ON `nodes` (`workflow_def_id`,`workflow_def_version`);
CREATE INDEX `idx_nodes_action` ON `nodes` (`action_id`,`action_version`);
