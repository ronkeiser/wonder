/** Test database helpers */

import { env } from 'cloudflare:test';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';

export function createTestDb(): DrizzleD1Database {
  return drizzle(env.DB);
}
