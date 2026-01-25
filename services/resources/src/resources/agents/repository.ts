/** Repository for agent data access */

import { and, desc, eq, isNull, max, or } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import { agents, definitions } from '../../schema';
import type { NewEntity } from '../../shared/types';
import type { Agent, AgentWithRelations } from './types';

type NewAgent = NewEntity<typeof agents.$inferInsert>;

/**
 * Subquery to get latest version per persona definition.
 * Uses definitions table where kind = 'persona'.
 */
function latestPersonaVersionsSubquery(db: DrizzleD1Database) {
  return db
    .select({
      personaId: definitions.id,
      latestVersion: max(definitions.version).as('latest_version'),
    })
    .from(definitions)
    .where(eq(definitions.kind, 'persona'))
    .groupBy(definitions.id)
    .as('latest_versions');
}

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
  const latestVersions = latestPersonaVersionsSubquery(db);

  const result = await db
    .select({
      id: agents.id,
      name: agents.name,
      projectIds: agents.projectIds,
      personaId: agents.personaId,
      personaVersion: agents.personaVersion,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      personaName: definitions.name,
    })
    .from(agents)
    .leftJoin(latestVersions, eq(agents.personaId, latestVersions.personaId))
    .leftJoin(
      definitions,
      and(
        eq(agents.personaId, definitions.id),
        eq(definitions.kind, 'persona'),
        or(
          eq(agents.personaVersion, definitions.version),
          and(isNull(agents.personaVersion), eq(definitions.version, latestVersions.latestVersion)),
        ),
      ),
    )
    .where(eq(agents.id, id))
    .get();

  return result ?? null;
}

export async function listAgents(db: DrizzleD1Database, limit: number = 100): Promise<AgentWithRelations[]> {
  const latestVersions = latestPersonaVersionsSubquery(db);

  const results = await db
    .select({
      id: agents.id,
      name: agents.name,
      projectIds: agents.projectIds,
      personaId: agents.personaId,
      personaVersion: agents.personaVersion,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
      personaName: definitions.name,
    })
    .from(agents)
    .leftJoin(latestVersions, eq(agents.personaId, latestVersions.personaId))
    .leftJoin(
      definitions,
      and(
        eq(agents.personaId, definitions.id),
        eq(definitions.kind, 'persona'),
        or(
          eq(agents.personaVersion, definitions.version),
          and(isNull(agents.personaVersion), eq(definitions.version, latestVersions.latestVersion)),
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
