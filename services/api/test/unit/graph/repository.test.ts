/** Unit tests for graph repository */

import { beforeAll, describe, expect, test } from 'vitest';
import { createAction } from '~/domains/effects/repository';
import {
  createNode,
  createProject,
  createWorkflowDef,
  createWorkspace,
  getNode,
  getProject,
  getWorkflowDef,
  getWorkspace,
  listNodesByWorkflowDef,
  listWorkflowDefsByOwner,
} from '~/domains/graph/repository';
import { createTestDb } from '../../helpers/db';

const db = createTestDb();

beforeAll(async () => {
  // Migrations applied automatically via setup file
});

describe('Workspace', () => {
  test('creates and retrieves workspace', async () => {
    const workspace = await createWorkspace(db, {
      name: 'Test Workspace',
      settings: null,
    });

    expect(workspace.id).toMatch(/^[0-9A-Z]{26}$/); // ULID format
    expect(workspace.name).toBe('Test Workspace');
    expect(workspace.created_at).toBeDefined();
    expect(workspace.updated_at).toBeDefined();

    const retrieved = await getWorkspace(db, workspace.id);
    expect(retrieved).toEqual(workspace);
  });

  test('returns null for non-existent workspace', async () => {
    const result = await getWorkspace(db, 'non_existent_id');
    expect(result).toBeNull();
  });
});

describe('Project', () => {
  test('creates and retrieves project', async () => {
    const workspace = await createWorkspace(db, {
      name: 'Test Workspace',
      settings: null,
    });

    const project = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Test Project',
      description: 'Test description',
      settings: null,
    });

    expect(project.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(project.workspace_id).toBe(workspace.id);
    expect(project.name).toBe('Test Project');

    const retrieved = await getProject(db, project.id);
    expect(retrieved).toEqual(project);
  });
});

describe('WorkflowDef', () => {
  test('creates workflow def with project owner', async () => {
    const workspace = await createWorkspace(db, { name: 'Test', settings: null });
    const project = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Test',
      description: null,
      settings: null,
    });

    const def = await createWorkflowDef(db, {
      name: 'Test Workflow',
      description: 'Test description',
      owner: { type: 'project', project_id: project.id },
      tags: null,
      input_schema: JSON.stringify({ type: 'object' }),
      output_schema: JSON.stringify({ type: 'object' }),
      context_schema: null,
      initial_node_id: 'node_start',
    });

    expect(def.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(def.version).toBe(1);
    expect(def.owner).toEqual({ type: 'project', project_id: project.id });
    expect(def.name).toBe('Test Workflow');
  });

  test('retrieves workflow def and transforms owner', async () => {
    const workspace = await createWorkspace(db, { name: 'Test', settings: null });
    const project = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Test',
      description: null,
      settings: null,
    });

    const def = await createWorkflowDef(db, {
      name: 'Test',
      description: 'Test',
      owner: { type: 'project', project_id: project.id },
      tags: null,
      input_schema: JSON.stringify({}),
      output_schema: JSON.stringify({}),
      context_schema: null,
      initial_node_id: 'start',
    });

    const retrieved = await getWorkflowDef(db, def.id);
    expect(retrieved).toEqual(def);
    expect(retrieved?.owner.type).toBe('project');
    if (retrieved?.owner.type === 'project') {
      expect(retrieved.owner.project_id).toBe(project.id);
    }
  });

  test('lists workflow defs by owner', async () => {
    const workspace = await createWorkspace(db, { name: 'Test', settings: null });
    const project1 = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Project 1',
      description: null,
      settings: null,
    });
    const project2 = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Project 2',
      description: null,
      settings: null,
    });

    const def1 = await createWorkflowDef(db, {
      name: 'Workflow 1',
      description: 'Test',
      owner: { type: 'project', project_id: project1.id },
      tags: null,
      input_schema: JSON.stringify({}),
      output_schema: JSON.stringify({}),
      context_schema: null,
      initial_node_id: 'start',
    });

    const def2 = await createWorkflowDef(db, {
      name: 'Workflow 2',
      description: 'Test',
      owner: { type: 'project', project_id: project1.id },
      tags: null,
      input_schema: JSON.stringify({}),
      output_schema: JSON.stringify({}),
      context_schema: null,
      initial_node_id: 'start',
    });

    await createWorkflowDef(db, {
      name: 'Workflow 3',
      description: 'Test',
      owner: { type: 'project', project_id: project2.id },
      tags: null,
      input_schema: JSON.stringify({}),
      output_schema: JSON.stringify({}),
      context_schema: null,
      initial_node_id: 'start',
    });

    const defs = await listWorkflowDefsByOwner(db, 'project', project1.id);
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.id)).toContain(def1.id);
    expect(defs.map((d) => d.id)).toContain(def2.id);
  });
});

describe('Node', () => {
  test('creates node with fan_in transformation', async () => {
    const workspace = await createWorkspace(db, { name: 'Test', settings: null });
    const project = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Test',
      description: null,
      settings: null,
    });
    const def = await createWorkflowDef(db, {
      name: 'Test',
      description: 'Test',
      owner: { type: 'project', project_id: project.id },
      tags: null,
      input_schema: JSON.stringify({}),
      output_schema: JSON.stringify({}),
      context_schema: null,
      initial_node_id: 'start',
    });
    const action = await createAction(db, {
      name: 'Test Action',
      description: 'Test',
      kind: 'llm_call',
      implementation: JSON.stringify({}),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });

    const node = await createNode(db, {
      workflow_def_id: def.id,
      workflow_def_version: def.version,
      name: 'Test Node',
      action_id: action.id,
      input_mapping: null,
      output_mapping: null,
      fan_out: 'first_match',
      fan_in: 'all',
      joins_node: null,
      merge: null,
      on_early_complete: null,
    });

    expect(node.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(node.fan_in).toBe('all');
  });

  test('creates node with m_of_n fan_in', async () => {
    const workspace = await createWorkspace(db, { name: 'Test', settings: null });
    const project = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Test',
      description: null,
      settings: null,
    });
    const def = await createWorkflowDef(db, {
      name: 'Test',
      description: 'Test',
      owner: { type: 'project', project_id: project.id },
      tags: null,
      input_schema: JSON.stringify({}),
      output_schema: JSON.stringify({}),
      context_schema: null,
      initial_node_id: 'start',
    });
    const action = await createAction(db, {
      name: 'Test Action',
      description: 'Test',
      kind: 'llm_call',
      implementation: JSON.stringify({}),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });

    const node = await createNode(db, {
      workflow_def_id: def.id,
      workflow_def_version: def.version,
      name: 'Test Node',
      action_id: action.id,
      input_mapping: null,
      output_mapping: null,
      fan_out: 'all',
      fan_in: { m_of_n: 3 },
      joins_node: null,
      merge: null,
      on_early_complete: null,
    });

    const retrieved = await getNode(db, node.id);
    expect(retrieved?.fan_in).toEqual({ m_of_n: 3 });
  });

  test('lists nodes by workflow def', async () => {
    const workspace = await createWorkspace(db, { name: 'Test', settings: null });
    const project = await createProject(db, {
      workspace_id: workspace.id,
      name: 'Test',
      description: null,
      settings: null,
    });
    const def = await createWorkflowDef(db, {
      name: 'Test',
      description: 'Test',
      owner: { type: 'project', project_id: project.id },
      tags: null,
      input_schema: JSON.stringify({}),
      output_schema: JSON.stringify({}),
      context_schema: null,
      initial_node_id: 'start',
    });
    const action1 = await createAction(db, {
      name: 'Action 1',
      description: 'Test',
      kind: 'llm_call',
      implementation: JSON.stringify({}),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });
    const action2 = await createAction(db, {
      name: 'Action 2',
      description: 'Test',
      kind: 'llm_call',
      implementation: JSON.stringify({}),
      requires: null,
      produces: null,
      execution: null,
      idempotency: null,
    });

    const node1 = await createNode(db, {
      workflow_def_id: def.id,
      workflow_def_version: def.version,
      name: 'Node 1',
      action_id: action1.id,
      input_mapping: null,
      output_mapping: null,
      fan_out: 'first_match',
      fan_in: 'any',
      joins_node: null,
      merge: null,
      on_early_complete: null,
    });

    const node2 = await createNode(db, {
      workflow_def_id: def.id,
      workflow_def_version: def.version,
      name: 'Node 2',
      action_id: action2.id,
      input_mapping: null,
      output_mapping: null,
      fan_out: 'first_match',
      fan_in: 'all',
      joins_node: null,
      merge: null,
      on_early_complete: null,
    });

    const nodes = await listNodesByWorkflowDef(db, def.id);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.id)).toContain(node1.id);
    expect(nodes.map((n) => n.id)).toContain(node2.id);
  });
});
