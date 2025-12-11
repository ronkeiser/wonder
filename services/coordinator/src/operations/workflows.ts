/**
 * Workflow Operations
 *
 * Load workflow definitions with caching.
 */

import type { WorkflowDef } from '../types.js';

/**
 * Load workflow definition from Resources service
 * For Chunk 1, we'll implement a stub that returns a minimal workflow
 */
export async function load(env: Env, workflowRunId: string): Promise<WorkflowDef> {
  // TODO: Call RESOURCES service via RPC to fetch WorkflowDef
  // For now, return a stub

  throw new Error(`Workflow loading not yet implemented for run: ${workflowRunId}`);
}

/**
 * Get cached workflow or load from Resources
 */
export async function getWorkflow(
  env: Env,
  workflowRunId: string,
  cache: Map<string, WorkflowDef>,
): Promise<WorkflowDef> {
  const cached = cache.get(workflowRunId);
  if (cached) {
    return cached;
  }

  const workflow = await load(env, workflowRunId);
  cache.set(workflowRunId, workflow);
  return workflow;
}
