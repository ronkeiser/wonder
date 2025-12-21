/**
 * Shared Database Instance
 *
 * Single drizzle instance for all coordinator operations.
 * Created once in the DO constructor, passed to all managers.
 */

import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';

import * as schema from '../schema';

export type CoordinatorDb = DrizzleSqliteDODatabase<typeof schema>;

/**
 * Create the shared database instance for coordinator operations.
 */
export function createDb(ctx: DurableObjectState): CoordinatorDb {
  return drizzle(ctx.storage, { schema, casing: 'snake_case' });
}