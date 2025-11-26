/** Test fixtures for execution domain */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { buildWorkflow } from '../graph/fixtures';
import { createToken, createWorkflowRun } from './repository';

type WorkflowRun = Awaited<ReturnType<typeof createWorkflowRun>>;
type Token = Awaited<ReturnType<typeof createToken>>;
type Workflow = Awaited<ReturnType<typeof buildWorkflow>>;

export async function buildWorkflowRun(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createWorkflowRun>[1]> & { workflow?: Workflow },
): Promise<WorkflowRun> {
  let project_id = overrides?.project_id;
  let workflow_id = overrides?.workflow_id;
  let workflow_def_id = overrides?.workflow_def_id;

  if (!workflow_id && !overrides?.workflow) {
    const workflow = await buildWorkflow(db);
    project_id = workflow.project_id;
    workflow_id = workflow.id;
    workflow_def_id = workflow.workflow_def_id;
  } else if (overrides?.workflow) {
    project_id = overrides.workflow.project_id;
    workflow_id = overrides.workflow.id;
    workflow_def_id = overrides.workflow.workflow_def_id;
  }

  return await createWorkflowRun(db, {
    project_id: project_id!,
    workflow_id: workflow_id!,
    workflow_def_id: workflow_def_id!,
    workflow_version: 1,
    status: 'running',
    context: JSON.stringify({ input: {}, state: {}, artifacts: {} }),
    active_tokens: JSON.stringify([]),
    durable_object_id: 'do_test',
    latest_snapshot: null,
    parent_run_id: null,
    parent_node_id: null,
    completed_at: null,
    ...overrides,
  });
}

export async function buildToken(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createToken>[1]> & { workflow_run?: WorkflowRun },
): Promise<Token> {
  let workflow_run_id = overrides?.workflow_run_id;

  if (!workflow_run_id && !overrides?.workflow_run) {
    const run = await buildWorkflowRun(db);
    workflow_run_id = run.id;
  } else if (overrides?.workflow_run) {
    workflow_run_id = overrides.workflow_run.id;
  }

  return await createToken(db, {
    workflow_run_id: workflow_run_id!,
    node_id: 'node_start',
    status: 'active',
    path_id: 'path_root',
    parent_token_id: null,
    fan_out_node_id: null,
    branch_index: 0,
    branch_total: 1,
    ...overrides,
  });
}
