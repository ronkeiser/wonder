/** Types for workflow runs */

import { workflowRuns } from '../../schema';

// ============================================================================
// Entity Types (inferred from schema)
// ============================================================================

/** WorkflowRun entity - inferred from database schema */
export type WorkflowRun = typeof workflowRuns.$inferSelect;

/** WorkflowRun with joined workspace ID (from project) */
export type WorkflowRunWithWorkspace = WorkflowRun & { workspaceId: string };

// ============================================================================
// API DTOs
// ============================================================================

/** Lightweight workflow run data for listing/sidebar - excludes heavy fields */
export type WorkflowRunSummary = Omit<
  WorkflowRun & { workflowName: string },
  'context' | 'activeTokens' | 'latestSnapshot' | 'durableObjectId'
>;

/** Filters for listing workflow runs */
export interface ListWorkflowRunsFilters {
  projectId?: string;
  workflowId?: string;
  definitionId?: string;
  status?: ('running' | 'completed' | 'failed' | 'waiting')[];
  parentRunId?: string | null; // null = only root runs
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}
