/** Types for workflow runs */

/** Lightweight workflow run data for listing/sidebar */
export interface WorkflowRunSummary {
  id: string;
  projectId: string;
  workflowId: string;
  workflowName: string;
  workflowDefId: string;
  workflowVersion: number;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  parentRunId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** Filters for listing workflow runs */
export interface ListWorkflowRunsFilters {
  projectId?: string;
  workflowId?: string;
  workflowDefId?: string;
  status?: ('running' | 'completed' | 'failed' | 'waiting')[];
  parentRunId?: string | null; // null = only root runs
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}
