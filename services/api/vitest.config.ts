import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
  // Read migrations at config time (Node.js context with fs access)
  const migrationsPath = resolve(__dirname, './src/infrastructure/db/migrations');
  const migrations = await readD1Migrations(migrationsPath);

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
            // Pass migrations as binding for Workers runtime
            bindings: { TEST_MIGRATIONS: migrations },
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
