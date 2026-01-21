/** Repository for workflow definition data access */

import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { nodes, transitions, workflowDefs } from '~/schema';
import type { NewEntity } from '~/shared/types';
import type { Node, Transition, WorkflowDef } from './types';

type NewWorkflowDef = NewEntity<typeof workflowDefs.$inferInsert>;
type NewNode = Omit<typeof nodes.$inferInsert, 'id'>;
type NewTransition = Omit<typeof transitions.$inferInsert, 'id'>;

/** WorkflowDef */

export async function createWorkflowDef(
  db: DrizzleD1Database,
  data: Omit<NewWorkflowDef, 'version'> & { version?: number },
): Promise<WorkflowDef> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(workflowDefs)
    .values({
      id: ulid(),
      version: data.version ?? 1,
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

/**
 * Create a workflow def with a pre-generated ID.
 * Used when we need to know all IDs upfront for ref resolution.
 */
export async function createWorkflowDefWithId(
  db: DrizzleD1Database,
  data: Omit<NewWorkflowDef, 'version'> & { id: string; version?: number },
): Promise<WorkflowDef> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(workflowDefs)
    .values({
      ...data,
      version: data.version ?? 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

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
        .from(workflowDefs)
        .where(and(eq(workflowDefs.id, id), eq(workflowDefs.version, version)))
    : db
        .select()
        .from(workflowDefs)
        .where(eq(workflowDefs.id, id))
        .orderBy(workflowDefs.version);

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
    .update(workflowDefs)
    .set({
      ...(data.initialNodeId !== undefined && { initialNodeId: data.initialNodeId }),
      updatedAt: now,
    })
    .where(and(eq(workflowDefs.id, id), eq(workflowDefs.version, version)))
    .run();
}

export async function listWorkflowDefsByProject(
  db: DrizzleD1Database,
  projectId: string,
): Promise<WorkflowDef[]> {
  return await db
    .select()
    .from(workflowDefs)
    .where(eq(workflowDefs.projectId, projectId))
    .all();
}

export async function listWorkflowDefsByLibrary(
  db: DrizzleD1Database,
  libraryId: string,
): Promise<WorkflowDef[]> {
  return await db
    .select()
    .from(workflowDefs)
    .where(eq(workflowDefs.libraryId, libraryId))
    .all();
}

/**
 * Find a workflow def by reference, project/library, and content hash.
 * Used for autoversion deduplication.
 */
export async function getWorkflowDefByReferenceAndHash(
  db: DrizzleD1Database,
  reference: string,
  projectId: string | null,
  libraryId: string | null,
  contentHash: string,
): Promise<WorkflowDef | null> {
  let whereClause;

  if (projectId) {
    whereClause = and(
      eq(workflowDefs.reference, reference),
      eq(workflowDefs.projectId, projectId),
      eq(workflowDefs.contentHash, contentHash),
    );
  } else if (libraryId) {
    whereClause = and(
      eq(workflowDefs.reference, reference),
      eq(workflowDefs.libraryId, libraryId),
      eq(workflowDefs.contentHash, contentHash),
    );
  } else {
    return null;
  }

  const result = await db.select().from(workflowDefs).where(whereClause).get();
  return result ?? null;
}

/**
 * Get the maximum version number for a workflow def by reference and project/library.
 * Returns 0 if no existing workflow def with that reference exists.
 */
export async function getMaxVersionByReference(
  db: DrizzleD1Database,
  reference: string,
  projectId: string | null,
  libraryId: string | null,
): Promise<number> {
  let whereClause;

  if (projectId) {
    whereClause = and(eq(workflowDefs.reference, reference), eq(workflowDefs.projectId, projectId));
  } else if (libraryId) {
    whereClause = and(eq(workflowDefs.reference, reference), eq(workflowDefs.libraryId, libraryId));
  } else {
    return 0;
  }

  const result = await db
    .select({ version: workflowDefs.version })
    .from(workflowDefs)
    .where(whereClause)
    .orderBy(desc(workflowDefs.version))
    .limit(1)
    .get();

  return result?.version ?? 0;
}

export async function listWorkflowDefs(
  db: DrizzleD1Database,
  limit: number = 100,
): Promise<WorkflowDef[]> {
  return await db.select().from(workflowDefs).limit(limit).all();
}

export async function getWorkflowDefByName(
  db: DrizzleD1Database,
  name: string,
  projectId: string | null,
  libraryId: string | null,
): Promise<WorkflowDef | null> {
  const result = await db
    .select()
    .from(workflowDefs)
    .where(
      and(
        eq(workflowDefs.name, name),
        projectId ? eq(workflowDefs.projectId, projectId) : isNull(workflowDefs.projectId),
        libraryId ? eq(workflowDefs.libraryId, libraryId) : isNull(workflowDefs.libraryId),
      ),
    )
    .orderBy(desc(workflowDefs.version))
    .get();
  return result ?? null;
}

/** Node */

export async function createNode(
  db: DrizzleD1Database,
  data: NewNode,
): Promise<Node> {
  const [row] = await db
    .insert(nodes)
    .values({
      id: ulid(),
      ...data,
    })
    .returning();

  return row;
}

/**
 * Create a node with a pre-generated ID.
 * Used when we need to know all IDs upfront for ref resolution.
 */
export async function createNodeWithId(
  db: DrizzleD1Database,
  data: NewNode & { id: string },
): Promise<Node> {
  const [row] = await db.insert(nodes).values(data).returning();

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
  data: NewTransition,
): Promise<Transition> {
  const [row] = await db
    .insert(transitions)
    .values({
      id: ulid(),
      ...data,
    })
    .returning();

  return row;
}

/**
 * Create a transition with a pre-generated ID.
 * Used when we need to know all IDs upfront for ref resolution.
 */
export async function createTransitionWithId(
  db: DrizzleD1Database,
  data: NewTransition & { id: string },
): Promise<Transition> {
  const [row] = await db.insert(transitions).values(data).returning();

  return row;
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

  // Delete workflowDef(s)
  if (version !== undefined) {
    await db
      .delete(workflowDefs)
      .where(and(eq(workflowDefs.id, id), eq(workflowDefs.version, version)))
      .run();
  } else {
    await db.delete(workflowDefs).where(eq(workflowDefs.id, id)).run();
  }
}
