/** Test database migration helpers
 *
 * IMPORTANT: All migrations are automatically discovered from src/infrastructure/db/migrations/*.sql
 * Changes to migration files automatically propagate to tests.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';

// Automatically import all migration files (Vite will inline these as strings at build time)
const migrationModules = import.meta.glob('../../src/infrastructure/db/migrations/*.sql', {
  query: '?raw',
  eager: true,
  import: 'default',
});

// Process each migration: remove drizzle-kit artifacts and backticks
const processMigration = (sql: string): string =>
  sql.replace(/--> statement-breakpoint\n/g, '').replace(/`/g, '');

// Sort migration files by filename (drizzle-kit uses numbered prefixes like 0000_, 0001_, etc.)
const MIGRATIONS = Object.keys(migrationModules)
  .sort()
  .map((path) => processMigration(migrationModules[path] as string));

/**
 * Apply all migrations in order to test database.
 * Automatically includes all migration files from src/infrastructure/db/migrations/
 */
export async function migrate(db: DrizzleD1Database): Promise<void> {
  for (const migrationSql of MIGRATIONS) {
    const statements = migrationSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await db.run(statement);
    }
  }
}
