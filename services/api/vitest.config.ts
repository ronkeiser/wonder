import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
  // Read migrations and seed data at config time (Node.js context with fs access)
  const migrationsPath = resolve(__dirname, './src/infrastructure/db/migrations');
  const migrations = await readD1Migrations(migrationsPath);

  const seedPath = resolve(__dirname, './src/infrastructure/db/seed.sql');
  const seedSql = readFileSync(seedPath, 'utf-8');

  return {
    test: {
      globals: false,
      setupFiles: ['./test/helpers/apply-migrations.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: './wrangler.test.jsonc' },
          main: './src/index.ts',
          miniflare: {
            // Pass migrations and seed data as bindings for Workers runtime
            bindings: {
              TEST_MIGRATIONS: migrations,
              TEST_SEED_SQL: seedSql,
            },
          },
        },
      },
    },
    resolve: {
      alias: {
        '~': resolve(__dirname, './src'),
      },
    },
  };
});
