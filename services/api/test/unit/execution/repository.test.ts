/** Unit tests for execution repository */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createWorkflowRun,
  getWorkflowRun,
  updateWorkflowRunContext,
  updateWorkflowRunSnapshot,
  updateWorkflowRunStatus,
} from '~/domains/execution/repository';
import {
  buildProject,
  buildWorkflow,
  buildWorkflowDef,
  buildWorkspace,
} from '~/domains/graph/fixtures';
import { createTestDb } from '../../helpers/db';
import { migrate } from '../../helpers/migrate';

const db = createTestDb();

beforeAll(async () => {
  await migrate(db);
});

describe('WorkflowRun', () => {
  test('creates and retrieves workflow run', async () => {
    const workspace = await buildWorkspace(db);
    const project = await buildProject(db, { workspace });
    const def = await buildWorkflowDef(db, { project });
    const workflow = await buildWorkflow(db, { project, workflow_def: def });

    const run = await createWorkflowRun(db, {
      project_id: project.id,
      workflow_id: workflow.id,
      workflow_def_id: def.id,
      workflow_version: 1,
      status: 'running',
      context: JSON.stringify({ input: { text: 'test' }, state: {}, artifacts: {} }),
      active_tokens: JSON.stringify([]),
      durable_object_id: 'do_test_123',
      latest_snapshot: null,
      parent_run_id: null,
      parent_node_id: null,
      completed_at: null,
    });

    expect(run.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(run.status).toBe('running');

    const retrieved = await getWorkflowRun(db, run.id);
    expect(retrieved).toEqual(run);
  });

  test('updates workflow run status', async () => {
    const workspace = await buildWorkspace(db);
    const project = await buildProject(db, { workspace });
    const def = await buildWorkflowDef(db, { project });
    const workflow = await buildWorkflow(db, { project, workflow_def: def });

    const run = await createWorkflowRun(db, {
      project_id: project.id,
      workflow_id: workflow.id,
      workflow_def_id: def.id,
      workflow_version: 1,
      status: 'running',
      context: JSON.stringify({}),
      active_tokens: JSON.stringify([]),
      durable_object_id: 'do_test',
      latest_snapshot: null,
      parent_run_id: null,
      parent_node_id: null,
      completed_at: null,
    });

    const completedAt = new Date().toISOString();
    await updateWorkflowRunStatus(db, run.id, 'completed', completedAt);

    const updated = await getWorkflowRun(db, run.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.completed_at).toBe(completedAt);
  });

  test('updates workflow run context', async () => {
    const workspace = await buildWorkspace(db);
    const project = await buildProject(db, { workspace });
    const def = await buildWorkflowDef(db, { project });
    const workflow = await buildWorkflow(db, { project, workflow_def: def });

    const run = await createWorkflowRun(db, {
      project_id: project.id,
      workflow_id: workflow.id,
      workflow_def_id: def.id,
      workflow_version: 1,
      status: 'running',
      context: JSON.stringify({ input: {}, state: {}, artifacts: {} }),
      active_tokens: JSON.stringify([]),
      durable_object_id: 'do_test',
      latest_snapshot: null,
      parent_run_id: null,
      parent_node_id: null,
      completed_at: null,
    });

    const newContext = { input: {}, state: { result: 'test' }, artifacts: {} };
    await updateWorkflowRunContext(db, run.id, newContext);

    const updated = await getWorkflowRun(db, run.id);
    const contextData =
      typeof updated?.context === 'string' ? JSON.parse(updated.context) : updated?.context;
    expect(contextData.state.result).toBe('test');
  });

  test('updates workflow run snapshot', async () => {
    const workspace = await buildWorkspace(db);
    const project = await buildProject(db, { workspace });
    const def = await buildWorkflowDef(db, { project });
    const workflow = await buildWorkflow(db, { project, workflow_def: def });

    const run = await createWorkflowRun(db, {
      project_id: project.id,
      workflow_id: workflow.id,
      workflow_def_id: def.id,
      workflow_version: 1,
      status: 'running',
      context: JSON.stringify({}),
      active_tokens: JSON.stringify([]),
      durable_object_id: 'do_test',
      latest_snapshot: null,
      parent_run_id: null,
      parent_node_id: null,
      completed_at: null,
    });

    const snapshot = {
      after_sequence_number: 42,
      context: { input: {}, state: {}, artifacts: {} },
      tokens: [],
    };
    await updateWorkflowRunSnapshot(db, run.id, snapshot);

    const updated = await getWorkflowRun(db, run.id);
    expect(updated?.latest_snapshot).toBeDefined();
    const snapshotData =
      typeof updated?.latest_snapshot === 'string'
        ? JSON.parse(updated.latest_snapshot)
        : updated?.latest_snapshot;
    expect(snapshotData.after_sequence_number).toBe(42);
  });
});
