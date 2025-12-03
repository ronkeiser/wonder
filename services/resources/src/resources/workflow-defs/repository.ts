/** Repository for workflow definition data access */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { nodes, transitions, workflow_defs } from '~/infrastructure/db/schema';

export type WorkflowDefOwner =
  | { type: 'project'; project_id: string }
  | { type: 'library'; library_id: string };

export type FanIn = 'any' | 'all' | { m_of_n: number };

type WorkflowDefRow = typeof workflow_defs.$inferSelect;
type NodeRow = typeof nodes.$inferSelect;
type TransitionRow = typeof transitions.$inferSelect;

type WorkflowDef = Omit<WorkflowDefRow, 'owner_type' | 'owner_id'> & {
  owner: WorkflowDefOwner;
};

type Node = Omit<NodeRow, 'fan_in'> & {
  fan_in: FanIn;
};

type Transition = TransitionRow;

/** Transform owner object to DB columns */
function fromWorkflowDefOwner(owner: WorkflowDefOwner): {
  owner_type: 'project' | 'library';
  owner_id: string;
} {
  if (owner.type === 'project') {
    return { owner_type: 'project', owner_id: owner.project_id };
  }
  return { owner_type: 'library', owner_id: owner.library_id };
}

/** Transform DB columns to owner object */
function toWorkflowDefOwner(owner_type: string, owner_id: string): WorkflowDefOwner {
  if (owner_type === 'project') {
    return { type: 'project', project_id: owner_id };
  }
  return { type: 'library', library_id: owner_id };
}

/** Transform fan_in DB column to typed value */
function toFanIn(fanIn: string | null): FanIn {
  if (!fanIn || fanIn === 'any') return 'any';
  if (fanIn === 'all') return 'all';
  // Handle m_of_n format: "m_of_n:3"
  if (fanIn.startsWith('m_of_n:')) {
    return { m_of_n: parseInt(fanIn.split(':')[1]) };
  }
  return 'any';
}

/** Transform fan_in typed value to DB column */
function fromFanIn(fanIn: FanIn): string {
  if (typeof fanIn === 'string') return fanIn;
  return `m_of_n:${fanIn.m_of_n}`;
}

/** WorkflowDef */

export async function createWorkflowDef(
  db: DrizzleD1Database,
  data: {
    name: string;
    description: string;
    owner: WorkflowDefOwner;
    tags?: string[] | null;
    input_schema: object;
    output_schema: object;
    context_schema?: object | null;
    initial_node_id: string | null;
  },
): Promise<WorkflowDef> {
  const now = new Date().toISOString();
  const { owner, ...rest } = data;
  const { owner_type, owner_id } = fromWorkflowDefOwner(owner);

  const row = {
    id: ulid(),
    version: 1,
    owner_type,
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

export async function updateWorkflowDef(
  db: DrizzleD1Database,
  id: string,
  version: number,
  data: { initial_node_id?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(workflow_defs)
    .set({
      ...data,
      updated_at: now,
    })
    .where(and(eq(workflow_defs.id, id), eq(workflow_defs.version, version)))
    .run();
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

/** Node */

export async function createNode(
  db: DrizzleD1Database,
  data: {
    ref: string;
    workflow_def_id: string;
    workflow_def_version: number;
    name: string;
    action_id: string;
    action_version: number;
    input_mapping?: unknown | null;
    output_mapping?: unknown | null;
    fan_out?: 'first_match' | 'all';
    fan_in?: FanIn;
    joins_node?: string | null;
    merge?: unknown | null;
    on_early_complete?: 'cancel' | 'abandon' | 'allow_late_merge' | null;
  },
): Promise<Node> {
  const id = ulid();
  const fanInValue = data.fan_in ?? 'any';

  const row = {
    id,
    ref: data.ref,
    workflow_def_id: data.workflow_def_id,
    workflow_def_version: data.workflow_def_version,
    name: data.name,
    action_id: data.action_id,
    action_version: data.action_version,
    input_mapping: data.input_mapping ?? null,
    output_mapping: data.output_mapping ?? null,
    fan_out: data.fan_out ?? 'first_match',
    fan_in: fromFanIn(fanInValue),
    joins_node: data.joins_node ?? null,
    merge: data.merge ?? null,
    on_early_complete: data.on_early_complete ?? null,
  };

  await db.insert(nodes).values(row).run();

  return {
    ...row,
    fan_in: fanInValue,
  };
}

export async function getNode(
  db: DrizzleD1Database,
  workflowDefId: string,
  workflowDefVersion: number,
  nodeId: string,
): Promise<Node | null> {
  const row = await db
    .select()
    .from(nodes)
    .where(
      and(
        eq(nodes.workflow_def_id, workflowDefId),
        eq(nodes.workflow_def_version, workflowDefVersion),
        eq(nodes.id, nodeId),
      ),
    )
    .get();

  if (!row) return null;

  return {
    ...row,
    fan_in: toFanIn(row.fan_in),
  };
}

export async function updateNode(
  db: DrizzleD1Database,
  nodeId: string,
  data: { joins_node?: string | null },
): Promise<void> {
  await db.update(nodes).set(data).where(eq(nodes.id, nodeId)).run();
}

export async function listNodesByWorkflowDef(
  db: DrizzleD1Database,
  workflowDefId: string,
): Promise<Node[]> {
  const rows = await db.select().from(nodes).where(eq(nodes.workflow_def_id, workflowDefId)).all();

  return rows.map((row) => ({
    ...row,
    fan_in: toFanIn(row.fan_in),
  }));
}

/** Transition */

export async function createTransition(
  db: DrizzleD1Database,
  data: {
    ref?: string | null;
    workflow_def_id: string;
    workflow_def_version: number;
    from_node_id: string;
    to_node_id: string;
    priority: number;
    condition?: unknown | null;
    foreach?: unknown | null;
    loop_config?: unknown | null;
  },
): Promise<Transition> {
  const row = {
    id: ulid(),
    ref: data.ref ?? null,
    workflow_def_id: data.workflow_def_id,
    workflow_def_version: data.workflow_def_version,
    from_node_id: data.from_node_id,
    to_node_id: data.to_node_id,
    priority: data.priority,
    condition: data.condition ?? null,
    foreach: data.foreach ?? null,
    loop_config: data.loop_config ?? null,
  };

  await db.insert(transitions).values(row).run();
  return row as Transition;
}

export async function listTransitionsByWorkflowDef(
  db: DrizzleD1Database,
  workflowDefId: string,
): Promise<Transition[]> {
  return await db
    .select()
    .from(transitions)
    .where(eq(transitions.workflow_def_id, workflowDefId))
    .all();
}
