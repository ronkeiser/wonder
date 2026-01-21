/** Repository for agent data access */

import { and, desc, eq, isNull, max, or } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { agents, personas } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Agent, AgentWithRelations } from './types';

type NewAgent = NewEntity<typeof agents.$inferInsert>;

export async function createAgent(db: DrizzleD1Database, data: NewAgent): Promise<AgentWithRelations> {
  const now = new Date().toISOString();
  const id = ulid();
  await db.insert(agents).values({
    id,
    ...data,
    createdAt: now,
    updatedAt: now,
  });

  // Re-fetch with join to get personaName
  const agent = await getAgent(db, id);
  return agent!;
}

export async function getAgent(db: DrizzleD1Database, id: string): Promise<AgentWithRelations | null> {
  // Subquery to get latest version per persona
  const latestVersions = db
    .select({
      personaId: personas.id,
      latestVersion: max(personas.version).as('latest_version'),
    })
    .from(personas)
    .groupBy(personas.id)
    .as('latest_versions');

  const result = await db
    .select({
      id: agents.id,
      name: agents.name,
      projectIds: agents.projectIds,
      personaId: agents.personaId,
      personaVersion: agents.personaVersion,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      personaName: personas.name,
    })
    .from(agents)
    .leftJoin(latestVersions, eq(agents.personaId, latestVersions.personaId))
    .leftJoin(
      personas,
      and(
        eq(agents.personaId, personas.id),
        or(
          eq(agents.personaVersion, personas.version),
          and(isNull(agents.personaVersion), eq(personas.version, latestVersions.latestVersion)),
        ),
      ),
    )
    .where(eq(agents.id, id))
    .get();

  return result ?? null;
}

export async function listAgents(db: DrizzleD1Database, limit: number = 100): Promise<AgentWithRelations[]> {
  // Subquery to get latest version per persona
  const latestVersions = db
    .select({
      personaId: personas.id,
      latestVersion: max(personas.version).as('latest_version'),
    })
    .from(personas)
    .groupBy(personas.id)
    .as('latest_versions');

  const results = await db
    .select({
      id: agents.id,
      name: agents.name,
      projectIds: agents.projectIds,
      personaId: agents.personaId,
      personaVersion: agents.personaVersion,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      personaName: personas.name,
    })
    .from(agents)
    .leftJoin(latestVersions, eq(agents.personaId, latestVersions.personaId))
    .leftJoin(
      personas,
      and(
        eq(agents.personaId, personas.id),
        or(
          eq(agents.personaVersion, personas.version),
          and(isNull(agents.personaVersion), eq(personas.version, latestVersions.latestVersion)),
        ),
      ),
    )
    .orderBy(desc(agents.createdAt))
    .limit(limit)
    .all();

  return results;
}

export async function deleteAgent(db: DrizzleD1Database, id: string): Promise<void> {
  await db.delete(agents).where(eq(agents.id, id)).run();
}

export async function updateAgent(
  db: DrizzleD1Database,
  id: string,
  data: Partial<NewAgent>,
): Promise<Agent | null> {
  const now = new Date().toISOString();
  const [updated] = await db
    .update(agents)
    .set({ ...data, updatedAt: now })
    .where(eq(agents.id, id))
    .returning();
  return updated ?? null;
}
