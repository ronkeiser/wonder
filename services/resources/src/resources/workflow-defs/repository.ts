/** Repository for workflow definition data access */

import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { nodes, transitions, workflow_defs } from '~/schema';
import type { Node, Transition, WorkflowDef } from './types';

/** WorkflowDef */

export async function createWorkflowDef(
  db: DrizzleD1Database,
  data: {
    name: string;
    description: string;
    projectId?: string | null;
    libraryId?: string | null;
    tags?: string[] | null;
    inputSchema: object;
    outputSchema: object;
    outputMapping?: object | null;
    contextSchema?: object | null;
    initialNodeId: string | null;
    contentHash?: string | null;
  },
): Promise<WorkflowDef> {
  const now = new Date().toISOString();

  const row = {
    id: ulid(),
    version: 1,
    name: data.name,
    description: data.description,
    projectId: data.projectId ?? null,
    libraryId: data.libraryId ?? null,
    tags: data.tags ?? null,
    inputSchema: data.inputSchema,
    outputSchema: data.outputSchema,
    outputMapping: data.outputMapping ?? null,
    contextSchema: data.contextSchema ?? null,
    initialNodeId: data.initialNodeId,
    contentHash: data.contentHash ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(workflow_defs).values(row).run();
  return row;
}

/**
 * Create a workflow def with a pre-generated ID.
 * Used when we need to know all IDs upfront for ref resolution.
 */
export async function createWorkflowDefWithId(
  db: DrizzleD1Database,
  data: {
    id: string;
    name: string;
    description: string;
    version?: number;
    projectId?: string | null;
    libraryId?: string | null;
    tags?: string[] | null;
    inputSchema: object;
    outputSchema: object;
    outputMapping?: object | null;
    contextSchema?: object | null;
    initialNodeId: string | null;
    contentHash?: string | null;
  },
): Promise<WorkflowDef> {
  const now = new Date().toISOString();

  const row = {
    id: data.id,
    version: data.version ?? 1,
    name: data.name,
    description: data.description,
    projectId: data.projectId ?? null,
    libraryId: data.libraryId ?? null,
    tags: data.tags ?? null,
    inputSchema: data.inputSchema,
    outputSchema: data.outputSchema,
    outputMapping: data.outputMapping ?? null,
    contextSchema: data.contextSchema ?? null,
    initialNodeId: data.initialNodeId,
    contentHash: data.contentHash ?? null,
    createdAt: now,
    updatedAt: now,
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
  data: { initialNodeId?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(workflow_defs)
    .set({
      ...(data.initialNodeId !== undefined && { initialNodeId: data.initialNodeId }),
      updatedAt: now,
    })
    .where(and(eq(workflow_defs.id, id), eq(workflow_defs.version, version)))
    .run();
}

export async function listWorkflowDefsByProject(
  db: DrizzleD1Database,
  projectId: string,
): Promise<WorkflowDef[]> {
  return await db
    .select()
    .from(workflow_defs)
    .where(eq(workflow_defs.projectId, projectId))
    .all();
}

export async function listWorkflowDefsByLibrary(
  db: DrizzleD1Database,
  libraryId: string,
): Promise<WorkflowDef[]> {
  return await db
    .select()
    .from(workflow_defs)
    .where(eq(workflow_defs.libraryId, libraryId))
    .all();
}

/**
 * Find a workflow def by name, project/library, and content hash.
 * Used for autoversion deduplication.
 */
export async function getWorkflowDefByNameAndHash(
  db: DrizzleD1Database,
  name: string,
  projectId: string | null,
  libraryId: string | null,
  contentHash: string,
): Promise<WorkflowDef | null> {
  let whereClause;

  if (projectId) {
    whereClause = and(
      eq(workflow_defs.name, name),
      eq(workflow_defs.projectId, projectId),
      eq(workflow_defs.contentHash, contentHash),
    );
  } else if (libraryId) {
    whereClause = and(
      eq(workflow_defs.name, name),
      eq(workflow_defs.libraryId, libraryId),
      eq(workflow_defs.contentHash, contentHash),
    );
  } else {
    return null;
  }

  const result = await db.select().from(workflow_defs).where(whereClause).get();
  return result ?? null;
}

/**
 * Get the maximum version number for a workflow def by name and project/library.
 * Returns 0 if no existing workflow def with that name exists.
 */
export async function getMaxVersionByName(
  db: DrizzleD1Database,
  name: string,
  projectId: string | null,
  libraryId: string | null,
): Promise<number> {
  let whereClause;

  if (projectId) {
    whereClause = and(eq(workflow_defs.name, name), eq(workflow_defs.projectId, projectId));
  } else if (libraryId) {
    whereClause = and(eq(workflow_defs.name, name), eq(workflow_defs.libraryId, libraryId));
  } else {
    return 0;
  }

  const result = await db
    .select({ version: workflow_defs.version })
    .from(workflow_defs)
    .where(whereClause)
    .orderBy(desc(workflow_defs.version))
    .limit(1)
    .get();

  return result?.version ?? 0;
}

/** Node */

export async function createNode(
  db: DrizzleD1Database,
  data: {
    ref: string;
    workflowDefId: string;
    workflowDefVersion: number;
    name: string;
    taskId?: string | null;
    taskVersion?: number | null;
    inputMapping?: object | null;
    outputMapping?: object | null;
    resourceBindings?: Record<string, string> | null;
  },
): Promise<Node> {
  const row = {
    id: ulid(),
    ref: data.ref,
    workflowDefId: data.workflowDefId,
    workflowDefVersion: data.workflowDefVersion,
    name: data.name,
    taskId: data.taskId ?? null,
    taskVersion: data.taskVersion ?? null,
    inputMapping: data.inputMapping ?? null,
    outputMapping: data.outputMapping ?? null,
    resourceBindings: data.resourceBindings ?? null,
  };

  await db.insert(nodes).values(row).run();
  return row;
}

/**
 * Create a node with a pre-generated ID.
 * Used when we need to know all IDs upfront for ref resolution.
 */
export async function createNodeWithId(
  db: DrizzleD1Database,
  data: {
    id: string;
    ref: string;
    workflowDefId: string;
    workflowDefVersion: number;
    name: string;
    taskId?: string | null;
    taskVersion?: number | null;
    inputMapping?: object | null;
    outputMapping?: object | null;
    resourceBindings?: Record<string, string> | null;
  },
): Promise<Node> {
  const row = {
    id: data.id,
    ref: data.ref,
    workflowDefId: data.workflowDefId,
    workflowDefVersion: data.workflowDefVersion,
    name: data.name,
    taskId: data.taskId ?? null,
    taskVersion: data.taskVersion ?? null,
    inputMapping: data.inputMapping ?? null,
    outputMapping: data.outputMapping ?? null,
    resourceBindings: data.resourceBindings ?? null,
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
        eq(nodes.workflowDefId, workflowDefId),
        eq(nodes.workflowDefVersion, workflowDefVersion),
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
  return await db.select().from(nodes).where(eq(nodes.workflowDefId, workflowDefId)).all();
}

/** Transition */

export async function createTransition(
  db: DrizzleD1Database,
  data: {
    ref?: string | null;
    workflowDefId: string;
    workflowDefVersion: number;
    fromNodeId: string;
    toNodeId: string;
    priority: number;
    condition?: object | null;
    spawnCount?: number | null;
    foreach?: object | null;
    synchronization?: object | null;
    loopConfig?: object | null;
  },
): Promise<Transition> {
  const row = {
    id: ulid(),
    ref: data.ref ?? null,
    workflowDefId: data.workflowDefId,
    workflowDefVersion: data.workflowDefVersion,
    fromNodeId: data.fromNodeId,
    toNodeId: data.toNodeId,
    priority: data.priority,
    condition: data.condition ?? null,
    spawnCount: data.spawnCount ?? null,
    foreach: data.foreach ?? null,
    synchronization: data.synchronization ?? null,
    loopConfig: data.loopConfig ?? null,
  };

  await db.insert(transitions).values(row).run();
  return row as Transition;
}

/**
 * Create a transition with a pre-generated ID.
 * Used when we need to know all IDs upfront for ref resolution.
 */
export async function createTransitionWithId(
  db: DrizzleD1Database,
  data: {
    id: string;
    ref?: string | null;
    workflowDefId: string;
    workflowDefVersion: number;
    fromNodeId: string;
    toNodeId: string;
    priority: number;
    condition?: object | null;
    spawnCount?: number | null;
    siblingGroup?: string | null;
    foreach?: object | null;
    synchronization?: object | null;
    loopConfig?: object | null;
  },
): Promise<Transition> {
  const row = {
    id: data.id,
    ref: data.ref ?? null,
    workflowDefId: data.workflowDefId,
    workflowDefVersion: data.workflowDefVersion,
    fromNodeId: data.fromNodeId,
    toNodeId: data.toNodeId,
    priority: data.priority,
    condition: data.condition ?? null,
    spawnCount: data.spawnCount ?? null,
    siblingGroup: data.siblingGroup ?? null,
    foreach: data.foreach ?? null,
    synchronization: data.synchronization ?? null,
    loopConfig: data.loopConfig ?? null,
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
    .where(eq(transitions.workflowDefId, workflowDefId))
    .all();
}

/** Delete WorkflowDef and all associated nodes and transitions */

export async function deleteWorkflowDef(
  db: DrizzleD1Database,
  id: string,
  version?: number,
): Promise<void> {
  // Delete associated nodes
  await db.delete(nodes).where(eq(nodes.workflowDefId, id)).run();

  // Delete associated transitions
  await db.delete(transitions).where(eq(transitions.workflowDefId, id)).run();

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
