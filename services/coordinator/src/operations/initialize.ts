/**
 * Initialization Operations
 *
 * Fetches workflow metadata from RESOURCES and prepares coordinator state.
 */

import type { JSONSchema } from '@wonder/context';
import type { WorkflowDef, WorkflowRun } from '../types.js';

/**
 * Initialize coordinator metadata
 *
 * Fetches workflow run and definition from RESOURCES service.
 * Called during DO initialization to load metadata.
 */
export async function initialize(
  env: Env,
  workflowRunId: string,
): Promise<{ workflowRun: WorkflowRun; workflowDef: WorkflowDef }> {
  // Fetch workflow run
  using workflowRunsResource = env.RESOURCES.workflowRuns();
  const runResponse = await workflowRunsResource.get(workflowRunId);
  const workflowRun = runResponse.workflow_run;

  // Fetch workflow definition
  using workflowDefsResource = env.RESOURCES.workflowDefs();
  const defResponse = await workflowDefsResource.get(workflowRun.workflow_def_id);
  const rawDef = defResponse.workflow_def;

  // Map to coordinator's WorkflowDef type
  const workflowDef: WorkflowDef = {
    id: rawDef.id,
    version: rawDef.version,
    initial_node_id: rawDef.initial_node_id!,
    input_schema: rawDef.input_schema as JSONSchema,
    context_schema: rawDef.context_schema as JSONSchema | undefined,
    output_schema: rawDef.output_schema as JSONSchema,
    output_mapping: rawDef.output_mapping as Record<string, string> | undefined,
  };

  return { workflowRun, workflowDef };
}
