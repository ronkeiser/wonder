/** Repository for workflow definition nodes and transitions */

import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { nodes, transitions } from '~/schema';
import type { Node, Transition } from './types';

type NewNode = Omit<typeof nodes.$inferInsert, 'id'>;
type NewTransition = Omit<typeof transitions.$inferInsert, 'id'>;

/** Node */

export async function createNode(db: DrizzleD1Database, data: NewNode): Promise<Node> {
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
export async function createNodeWithId(db: DrizzleD1Database, data: NewNode & { id: string }): Promise<Node> {
  const [row] = await db.insert(nodes).values(data).returning();

  return row;
}

export async function getNode(
  db: DrizzleD1Database,
  definitionId: string,
  definitionVersion: number,
  nodeId: string,
): Promise<Node | null> {
  const result = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.definitionId, definitionId), eq(nodes.definitionVersion, definitionVersion), eq(nodes.id, nodeId)))
    .get();
  return result ?? null;
}

export async function listNodesByDefinition(db: DrizzleD1Database, definitionId: string): Promise<Node[]> {
  return await db.select().from(nodes).where(eq(nodes.definitionId, definitionId)).all();
}

/** Transition */

export async function createTransition(db: DrizzleD1Database, data: NewTransition): Promise<Transition> {
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

export async function listTransitionsByDefinition(db: DrizzleD1Database, definitionId: string): Promise<Transition[]> {
  return await db
    .select()
    .from(transitions)
    .where(eq(transitions.definitionId, definitionId))
    .all();
}

/** Delete nodes and transitions for a definition */

export async function deleteNodesAndTransitions(db: DrizzleD1Database, definitionId: string): Promise<void> {
  // Delete associated nodes
  await db.delete(nodes).where(eq(nodes.definitionId, definitionId)).run();

  // Delete associated transitions
  await db.delete(transitions).where(eq(transitions.definitionId, definitionId)).run();
}
