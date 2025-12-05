/** Repository for workflow definition data access */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { nodes, transitions, workflow_defs } from '~/infrastructure/db/schema';
import type { Node, Transition, WorkflowDef } from './types';

/** WorkflowDef */

export async function createWorkflowDef(
  db: DrizzleD1Database,
  data: {
    name: string;
    description: string;
    project_id?: string | null;
    library_id?: string | null;
    tags?: string[] | null;
    input_schema: object;
    output_schema: object;
    output_mapping?: object | null;
    context_schema?: object | null;
    initial_node_id: string | null;
  },
): Promise<WorkflowDef> {
  const now = new Date().toISOString();

  const row = {
    id: ulid(),
    version: 1,
    name: data.name,
    description: data.description,
    project_id: data.project_id ?? null,
    library_id: data.library_id ?? null,
    tags: data.tags ?? null,
    input_schema: data.input_schema,
    output_schema: data.output_schema,
    output_mapping: data.output_mapping ?? null,
    context_schema: data.context_schema ?? null,
    initial_node_id: data.initial_node_id,
    created_at: now,
    updated_at: now,
  };

  await db.insert(workflow_defs).values(row).run();
  return row;
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

  const result = await query.get();
  return result ?? null;
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

export async function listWorkflowDefsByProject(
  db: DrizzleD1Database,
  project_id: string,
): Promise<WorkflowDef[]> {
  return await db
    .select()
    .from(workflow_defs)
    .where(eq(workflow_defs.project_id, project_id))
    .all();
}

export async function listWorkflowDefsByLibrary(
  db: DrizzleD1Database,
  library_id: string,
): Promise<WorkflowDef[]> {
  return await db
    .select()
    .from(workflow_defs)
    .where(eq(workflow_defs.library_id, library_id))
    .all();
}

/** Node */

export async function createNode(
  db: DrizzleD1Database,
  data: {
    ref: string;
    workflow_def_id: string;
    workflow_def_version: number;
    name: string;
    action_id?: string | null;
    action_version?: number | null;
    input_mapping?: object | null;
    output_mapping?: object | null;
  },
): Promise<Node> {
  const row = {
    id: ulid(),
    ref: data.ref,
    workflow_def_id: data.workflow_def_id,
    workflow_def_version: data.workflow_def_version,
    name: data.name,
    action_id: data.action_id ?? null,
    action_version: data.action_version ?? null,
    input_mapping: data.input_mapping ?? null,
    output_mapping: data.output_mapping ?? null,
  };

  await db.insert(nodes).values(row).run();
  return row;
}

export async function getNode(
  db: DrizzleD1Database,
  workflowDefId: string,
  workflowDefVersion: number,
  nodeId: string,
): Promise<Node | null> {
  const result = await db
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
  return result ?? null;
}

// updateNode function removed - nodes no longer have mutable branching fields

export async function listNodesByWorkflowDef(
  db: DrizzleD1Database,
  workflowDefId: string,
): Promise<Node[]> {
  return await db.select().from(nodes).where(eq(nodes.workflow_def_id, workflowDefId)).all();
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
    condition?: object | null;
    spawn_count?: number | null;
    foreach?: object | null;
    synchronization?: object | null;
    loop_config?: object | null;
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
    spawn_count: data.spawn_count ?? null,
    foreach: data.foreach ?? null,
    synchronization: data.synchronization ?? null,
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

/** Delete WorkflowDef and all associated nodes and transitions */

export async function deleteWorkflowDef(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  // Delete associated nodes
  await db.delete(nodes).where(eq(nodes.workflow_def_id, id)).run();

  // Delete associated transitions
  await db.delete(transitions).where(eq(transitions.workflow_def_id, id)).run();

  // Delete workflow_def(s)
  if (version !== undefined) {
    await db
      .delete(workflow_defs)
      .where(and(eq(workflow_defs.id, id), eq(workflow_defs.version, version)))
      .run();
  } else {
    await db.delete(workflow_defs).where(eq(workflow_defs.id, id)).run();
  }
}
