/** Apply seed data from seed.sql to test database */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(__dirname, '../../src/infrastructure/db/seed.sql');

export async function applySeedData(db: D1Database): Promise<void> {
  const seedSql = readFileSync(seedPath, 'utf-8');

  // Split by semicolons and filter out empty statements
  const statements = seedSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  // Execute each statement
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}
