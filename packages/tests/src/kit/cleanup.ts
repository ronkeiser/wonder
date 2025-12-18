/**
 * Cleanup Utilities
 *
 * Functions for cleaning up test resources.
 */

import { wonder } from '~/client';
import type { Deletable, WorkflowTestSetup } from './types';

export type { Deletable } from './types';

/**
 * Cleans up resources in reverse order (LIFO).
 * Silently continues if a delete fails.
 */
export async function cleanup(...resources: (Deletable | undefined | null)[]) {
  // Reverse order - delete most recently created resources first
  for (const resource of resources.reverse()) {
    if (resource) {
      try {
        await resource.delete();
      } catch (error) {
        // Silently continue - resource may already be deleted or cascade deleted
        console.warn('Failed to delete resource:', error);
      }
    }
  }
}

/**
 * Cleans up workflow run after a test.
 *
 * Currently does nothing - all resources are preserved so that:
 * 1. workflow_runs appear in the sidebar for debugging/inspection
 * 2. workflows persist so the JOIN query to get workflow_name works
 * 3. workflow_defs, task_defs, actions, prompt_specs persist for reuse
 *
 * TODO: Implement workflow_def deduplication (see docs/planning/workflow-def-deduplication.md)
 * so that repeated test runs reuse existing definitions instead of creating duplicates.
 */
export async function cleanupWorkflowTest(
  _setup: WorkflowTestSetup,
  _workflowRunId?: string,
  _taskDefId?: string,
  _actionId?: string,
  _promptSpecId?: string,
): Promise<number> {
  // No cleanup - preserve all resources for sidebar visibility and reuse
  return 0;
}
