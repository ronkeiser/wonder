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
 * Cleans up all resources created during a workflow test.
 * Handles both legacy explicit IDs and new createdResources tracking.
 * Returns the count of resources deleted.
 */
export async function cleanupWorkflowTest(
  setup: WorkflowTestSetup,
  workflowRunId?: string,
  taskDefId?: string,
  actionId?: string,
  promptSpecId?: string,
): Promise<number> {
  let count = 0;

  // Delete workflow run
  if (workflowRunId) {
    try {
      await wonder['workflow-runs'](workflowRunId).delete();
      count++;
    } catch (e) {
      console.warn('Failed to delete workflow run:', e);
    }
  }

  // Delete workflow
  try {
    await wonder.workflows(setup.workflowId).delete();
    count++;
  } catch (e) {
    console.warn('Failed to delete workflow:', e);
  }

  // Delete workflow def
  try {
    await wonder['workflow-defs'](setup.workflowDefId).delete();
    count++;
  } catch (e) {
    console.warn('Failed to delete workflow def:', e);
  }

  // Delete task defs (reverse order for any dependencies)
  const taskDefIds = [...(setup.createdResources?.taskIds || [])];
  if (taskDefId) taskDefIds.push(taskDefId);
  for (const id of taskDefIds.reverse()) {
    try {
      await wonder['tasks'](id).delete();
      count++;
    } catch (e) {
      console.warn('Failed to delete task def:', e);
    }
  }

  // Delete actions
  const actionIds = [...(setup.createdResources?.actionIds || [])];
  if (actionId) actionIds.push(actionId);
  for (const id of actionIds.reverse()) {
    try {
      await wonder.actions(id).delete();
      count++;
    } catch (e) {
      console.warn('Failed to delete action:', e);
    }
  }

  // Delete prompt specs
  const promptSpecIds = [...(setup.createdResources?.promptSpecIds || [])];
  if (promptSpecId) promptSpecIds.push(promptSpecId);
  for (const id of promptSpecIds.reverse()) {
    try {
      await wonder['prompt-specs'](id).delete();
      count++;
    } catch (e) {
      console.warn('Failed to delete prompt spec:', e);
    }
  }

  // Delete model profile, project, workspace
  try {
    await wonder['model-profiles'](setup.modelProfileId).delete();
    count++;
  } catch (e) {
    console.warn('Failed to delete model profile:', e);
  }

  try {
    await wonder.projects(setup.projectId).delete();
    count++;
  } catch (e) {
    console.warn('Failed to delete project:', e);
  }

  try {
    await wonder.workspaces(setup.workspaceId).delete();
    count++;
  } catch (e) {
    console.warn('Failed to delete workspace:', e);
  }

  return count;
}
