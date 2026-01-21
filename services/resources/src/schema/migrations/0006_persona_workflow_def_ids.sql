-- Rename persona workflow fields to reference workflow_defs instead of workflows
-- This allows personas to directly reference library-level workflow definitions

ALTER TABLE personas RENAME COLUMN context_assembly_workflow_id TO context_assembly_workflow_def_id;
ALTER TABLE personas RENAME COLUMN memory_extraction_workflow_id TO memory_extraction_workflow_def_id;

-- Note: workflow_runs.workflowId is now nullable in the schema.
-- SQLite doesn't support ALTER COLUMN to remove NOT NULL, but the schema change
-- will be applied on new tables. Existing workflow runs will continue to have
-- workflowId values, which is fine.
