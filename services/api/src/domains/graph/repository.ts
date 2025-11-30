/** Repository for graph domain entities */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import {
  nodes,
  projects,
  transitions,
  workflow_defs,
  workflows,
  workspaces,
} from '~/infrastructure/db/schema';
import {
  fromFanIn,
  fromWorkflowDefOwner,
  toFanIn,
  toWorkflowDefOwner,
  type FanIn,
  type WorkflowDefOwner,
} from './transforms';

type Workspace = typeof workspaces.$inferSelect;
type NewWorkspace = Omit<typeof workspaces.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

type Project = typeof projects.$inferSelect;
type NewProject = Omit<typeof projects.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

type WorkflowDefRow = typeof workflow_defs.$inferSelect;
type NewWorkflowDefRow = typeof workflow_defs.$inferInsert;

type WorkflowDef = Omit<WorkflowDefRow, 'owner_type' | 'owner_id'> & {
  owner: WorkflowDefOwner;
};
type NewWorkflowDef = Omit<
  NewWorkflowDefRow,
  'id' | 'version' | 'created_at' | 'updated_at' | 'owner_type' | 'owner_id'
> & {
  owner: WorkflowDefOwner;
};

type Workflow = typeof workflows.$inferSelect;
type NewWorkflow = Omit<typeof workflows.$inferInsert, 'id' | 'created_at' | 'updated_at'>;

type NodeRow = typeof nodes.$inferSelect;
type NewNodeRow = typeof nodes.$inferInsert;

type Node = Omit<NodeRow, 'fan_in'> & {
  fan_in: FanIn;
};
type NewNode = Omit<NewNodeRow, 'id' | 'fan_in'> & {
  fan_in: FanIn;
};

type Transition = typeof transitions.$inferSelect;
type NewTransition = typeof transitions.$inferInsert;

/** Workspace */

export async function createWorkspace(
  db: DrizzleD1Database,
  data: NewWorkspace,
): Promise<Workspace> {
  const now = new Date().toISOString();
  const workspace = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workspaces).values(workspace).run();
  return workspace as Workspace;
}

export async function getWorkspace(db: DrizzleD1Database, id: string): Promise<Workspace | null> {
  const result = await db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  return result ?? null;
}

export async function listWorkspaces(
  db: DrizzleD1Database,
  options?: { limit?: number; offset?: number },
): Promise<Workspace[]> {
  let query = db.select().from(workspaces);

  if (options?.limit) {
    query = query.limit(options.limit) as any;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as any;
  }

  return await query.all();
}

export async function updateWorkspace(
  db: DrizzleD1Database,
  id: string,
  data: Partial<Pick<NewWorkspace, 'name' | 'settings'>>,
): Promise<Workspace> {
  const now = new Date().toISOString();

  await db
    .update(workspaces)
    .set({
      ...data,
      updated_at: now,
    })
    .where(eq(workspaces.id, id))
    .run();

  const updated = await getWorkspace(db, id);
  if (!updated) {
    throw new Error(`Workspace not found after update: ${id}`);
  }
  return updated;
}

/** Project */

export async function createProject(db: DrizzleD1Database, data: NewProject): Promise<Project> {
  const now = new Date().toISOString();
  const project = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(projects).values(project).run();
  return project as Project;
}

export async function getProject(db: DrizzleD1Database, id: string): Promise<Project | null> {
  const result = await db.select().from(projects).where(eq(projects.id, id)).get();
  return result ?? null;
}

/** WorkflowDef */

export async function createWorkflowDef(
  db: DrizzleD1Database,
  data: NewWorkflowDef,
): Promise<WorkflowDef> {
  const now = new Date().toISOString();
  const { owner, ...rest } = data;
  const { owner_type, owner_id } = fromWorkflowDefOwner(owner);

  const row: NewWorkflowDefRow = {
    id: ulid(),
    version: 1,
    owner_type: owner_type as 'project' | 'library',
    owner_id,
    ...rest,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workflow_defs).values(row).run();

  return {
    ...row,
    owner,
  } as WorkflowDef;
}

export async function getWorkflowDef(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<WorkflowDef | null> {
  const query = version
    ? db
        .select()
        .from(workflow_defs)
        .where(and(eq(workflow_defs.id, id), eq(workflow_defs.version, version)))
    : db
        .select()
        .from(workflow_defs)
        .where(eq(workflow_defs.id, id))
        .orderBy(workflow_defs.version);

  const row = await query.get();
  if (!row) return null;

  return {
    ...row,
    owner: toWorkflowDefOwner(row.owner_type, row.owner_id),
  };
}

export async function listWorkflowDefsByOwner(
  db: DrizzleD1Database,
  owner_type: 'project' | 'library',
  owner_id: string,
): Promise<WorkflowDef[]> {
  const rows = await db
    .select()
    .from(workflow_defs)
    .where(and(eq(workflow_defs.owner_type, owner_type), eq(workflow_defs.owner_id, owner_id)))
    .all();

  return rows.map((row) => ({
    ...row,
    owner: toWorkflowDefOwner(row.owner_type, row.owner_id),
  }));
}

/** Workflow */

export async function createWorkflow(db: DrizzleD1Database, data: NewWorkflow): Promise<Workflow> {
  const now = new Date().toISOString();
  const workflow = {
    id: ulid(),
    ...data,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workflows).values(workflow).run();
  return workflow as Workflow;
}

export async function getWorkflow(db: DrizzleD1Database, id: string): Promise<Workflow | null> {
  const result = await db.select().from(workflows).where(eq(workflows.id, id)).get();
  return result ?? null;
}

/** Node */

export async function createNode(db: DrizzleD1Database, data: NewNode): Promise<Node> {
  const { fan_in, ...rest } = data;
  const row: NewNodeRow = {
    id: ulid(),
    ...rest,
    fan_in: fromFanIn(fan_in),
  };

  await db.insert(nodes).values(row).run();

  return {
    ...row,
    fan_in,
  } as Node;
}

export async function getNode(
  db: DrizzleD1Database,
  workflow_def_id: string,
  workflow_def_version: number,
  id: string,
): Promise<Node | null> {
  const row = await db
    .select()
    .from(nodes)
    .where(
      and(
        eq(nodes.workflow_def_id, workflow_def_id),
        eq(nodes.workflow_def_version, workflow_def_version),
        eq(nodes.id, id),
      ),
    )
    .get();
  if (!row) return null;

  return {
    ...row,
    fan_in: toFanIn(row.fan_in as string),
  };
}

export async function listNodesByWorkflowDef(
  db: DrizzleD1Database,
  workflow_def_id: string,
  workflow_def_version?: number,
): Promise<Node[]> {
  const query = workflow_def_version
    ? db
        .select()
        .from(nodes)
        .where(
          and(
            eq(nodes.workflow_def_id, workflow_def_id),
            eq(nodes.workflow_def_version, workflow_def_version),
          ),
        )
    : db.select().from(nodes).where(eq(nodes.workflow_def_id, workflow_def_id));

  const rows = await query.all();

  return rows.map((row) => ({
    ...row,
    fan_in: toFanIn(row.fan_in as string),
  }));
}

/** Transition */

export async function createTransition(
  db: DrizzleD1Database,
  data: NewTransition,
): Promise<Transition> {
  await db.insert(transitions).values(data).run();
  return data as Transition;
}

export async function listTransitionsByWorkflowDef(
  db: DrizzleD1Database,
  workflow_def_id: string,
): Promise<Transition[]> {
  return await db
    .select()
    .from(transitions)
    .where(eq(transitions.workflow_def_id, workflow_def_id))
    .all();
}
