/** Service context for dependency injection */

import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * ServiceContext bundles all external dependencies needed by service layer functions.
 * This enables clean composition across domains and simplifies testing.
 */
export interface ServiceContext {
  /** Drizzle D1 database connection */
  db: DrizzleD1Database;

  /** Workers AI binding for LLM inference */
  ai: Ai;

  // Future dependencies to be added:
  // vectorize: Vectorize;
  // logger: Logger;
  // r2: R2Bucket;
}

/**
 * Creates a ServiceContext from Cloudflare Worker environment bindings.
 * Called at the start of each request to initialize service dependencies.
 */
export function createServiceContext(db: DrizzleD1Database, ai: Ai): ServiceContext {
  return {
    db,
    ai,
  };
}
