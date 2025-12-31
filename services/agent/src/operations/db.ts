/**
 * Shared Database Instance
 *
 * Single drizzle instance for all agent operations.
 * Created once in the DO constructor, passed to all managers.
 */

import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';

import * as schema from '../schema';

export type AgentDb = DrizzleSqliteDODatabase<typeof schema>;

/**
 * Create the shared database instance for agent operations.
 */
export function createDb(ctx: DurableObjectState): AgentDb {
  return drizzle(ctx.storage, { schema, casing: 'snake_case' });
}
