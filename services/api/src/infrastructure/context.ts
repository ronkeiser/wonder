/** Service context for dependency injection */

import type { Logger } from '@wonder/logger';
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

  /** Structured logger for application events */
  logger: Logger;

  // Future dependencies to be added:
  // vectorize: Vectorize;
  // r2: R2Bucket;
}

/**
 * Creates a ServiceContext from Cloudflare Worker environment bindings.
 * Called at the start of each request to initialize service dependencies.
 */
export function createServiceContext(
  db: DrizzleD1Database,
  ai: Ai,
  logger: Logger,
): ServiceContext {
  return {
    db,
    ai,
    logger,
  };
}
