-- Make workflow_runs.workflow_id nullable for def-only runs (agent workflows)
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Step 1: Create new table with nullable workflow_id
CREATE TABLE workflow_runs_new (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    workflow_id TEXT,
    workflow_def_id TEXT NOT NULL,
    workflow_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    context TEXT NOT NULL,
    active_tokens TEXT NOT NULL,
    durable_object_id TEXT NOT NULL,
    latest_snapshot TEXT,
    root_run_id TEXT NOT NULL,
    parent_run_id TEXT,
    parent_node_id TEXT,
    parent_token_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);
--> statement-breakpoint
-- Step 2: Copy data from old table
INSERT INTO workflow_runs_new SELECT * FROM workflow_runs;
--> statement-breakpoint
-- Step 3: Drop old table
DROP TABLE workflow_runs;
--> statement-breakpoint
-- Step 4: Rename new table
ALTER TABLE workflow_runs_new RENAME TO workflow_runs;
--> statement-breakpoint
-- Step 5: Recreate indexes
CREATE INDEX idx_workflow_runs_project ON workflow_runs(project_id);
--> statement-breakpoint
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id);
--> statement-breakpoint
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
--> statement-breakpoint
CREATE INDEX idx_workflow_runs_root ON workflow_runs(root_run_id);
--> statement-breakpoint
CREATE INDEX idx_workflow_runs_parent ON workflow_runs(parent_run_id);
--> statement-breakpoint
CREATE INDEX idx_workflow_runs_created_at ON workflow_runs(created_at);
