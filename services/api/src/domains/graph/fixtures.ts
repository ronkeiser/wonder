/** Test fixtures for graph domain */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import {
  createNode,
  createProject,
  createWorkflow,
  createWorkflowDef,
  createWorkspace,
} from './repository';
import type { FanIn, WorkflowDefOwner } from './transforms';

type Workspace = Awaited<ReturnType<typeof createWorkspace>>;
type Project = Awaited<ReturnType<typeof createProject>>;
type WorkflowDef = Awaited<ReturnType<typeof createWorkflowDef>>;
type Workflow = Awaited<ReturnType<typeof createWorkflow>>;
type Node = Awaited<ReturnType<typeof createNode>>;

export async function buildWorkspace(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createWorkspace>[1]>,
): Promise<Workspace> {
  return await createWorkspace(db, {
    name: 'Test Workspace',
    settings: null,
    ...overrides,
  });
}

export async function buildProject(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createProject>[1]> & { workspace?: Workspace },
): Promise<Project> {
  let workspace_id = overrides?.workspace_id;

  if (!workspace_id && !overrides?.workspace) {
    const workspace = await buildWorkspace(db);
    workspace_id = workspace.id;
  } else if (overrides?.workspace) {
    workspace_id = overrides.workspace.id;
  }

  return await createProject(db, {
    workspace_id: workspace_id!,
    name: 'Test Project',
    description: null,
    settings: null,
    ...overrides,
  });
}

export async function buildWorkflowDef(
  db: DrizzleD1Database,
  overrides?: Partial<Omit<Parameters<typeof createWorkflowDef>[1], 'owner'>> & {
    owner?: WorkflowDefOwner;
    project?: Project;
  },
): Promise<WorkflowDef> {
  let owner: WorkflowDefOwner;

  if (overrides?.owner) {
    owner = overrides.owner;
  } else if (overrides?.project) {
    owner = { type: 'project', project_id: overrides.project.id };
  } else {
    const project = await buildProject(db);
    owner = { type: 'project', project_id: project.id };
  }

  return await createWorkflowDef(db, {
    name: 'Test Workflow',
    description: 'Test workflow description',
    owner,
    tags: null,
    input_schema: JSON.stringify({ type: 'object', properties: {} }),
    output_schema: JSON.stringify({ type: 'object', properties: {} }),
    context_schema: null,
    initial_node_id: 'node_start',
    ...overrides,
  });
}

export async function buildNode(
  db: DrizzleD1Database,
  overrides?: Partial<Omit<Parameters<typeof createNode>[1], 'fan_in'>> & {
    fan_in?: FanIn;
    workflow_def?: WorkflowDef;
  },
): Promise<Node> {
  let workflow_def_id = overrides?.workflow_def_id;

  if (!workflow_def_id && !overrides?.workflow_def) {
    const def = await buildWorkflowDef(db);
    workflow_def_id = def.id;
  } else if (overrides?.workflow_def) {
    workflow_def_id = overrides.workflow_def.id;
  }

  return await createNode(db, {
    workflow_def_id: workflow_def_id!,
    workflow_def_version: overrides?.workflow_def_version ?? 1,
    action_version: overrides?.action_version ?? 1,
    name: 'Test Node',
    action_id: 'action_test',
    input_mapping: null,
    output_mapping: null,
    fan_out: 'first_match',
    fan_in: 'all',
    joins_node: null,
    merge: null,
    on_early_complete: null,
    ...overrides,
  });
}

export async function buildWorkflow(
  db: DrizzleD1Database,
  overrides?: Partial<Parameters<typeof createWorkflow>[1]> & {
    project?: Project;
    workflow_def?: WorkflowDef;
  },
): Promise<Workflow> {
  let project_id = overrides?.project_id;
  let workflow_def_id = overrides?.workflow_def_id;

  if (!project_id && !overrides?.project) {
    const project = await buildProject(db);
    project_id = project.id;
  } else if (overrides?.project) {
    project_id = overrides.project.id;
  }

  if (!workflow_def_id && !overrides?.workflow_def) {
    const def = await buildWorkflowDef(db, { owner: { type: 'project', project_id: project_id! } });
    workflow_def_id = def.id;
  } else if (overrides?.workflow_def) {
    workflow_def_id = overrides.workflow_def.id;
  }

  return await createWorkflow(db, {
    project_id: project_id!,
    name: 'Test Workflow Binding',
    description: 'Test workflow binding description',
    workflow_def_id: workflow_def_id!,
    pinned_version: null,
    enabled: true,
    ...overrides,
  });
}
