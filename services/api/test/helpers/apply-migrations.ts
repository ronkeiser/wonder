/** Apply D1 migrations in test setup
 *
 * This setup file runs before tests and applies all migrations to the test database.
 * Migrations are read at config time by vitest.config.ts using readD1Migrations(),
 * then passed as the TEST_MIGRATIONS binding.
 *
 * Setup files run outside isolated storage and may run multiple times.
 * applyD1Migrations() only applies migrations that haven't already been applied,
 * so it's safe to call here.
 */

import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
