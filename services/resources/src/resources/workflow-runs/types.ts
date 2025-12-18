/** Types for workflow runs */

/** Lightweight workflow run data for listing/sidebar */
export interface WorkflowRunSummary {
  id: string;
  project_id: string;
  workflow_id: string;
  workflow_name: string;
  workflow_def_id: string;
  workflow_version: number;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  parent_run_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Filters for listing workflow runs */
export interface ListWorkflowRunsFilters {
  project_id?: string;
  workflow_id?: string;
  workflow_def_id?: string;
  status?: ('running' | 'completed' | 'failed' | 'waiting')[];
  parent_run_id?: string | null; // null = only root runs
  created_after?: string;
  created_before?: string;
  limit?: number;
  offset?: number;
}
