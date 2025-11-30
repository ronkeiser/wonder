import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: false,
    poolOptions: {
      workers: {
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        main: './src/index.ts',
        miniflare: {
          bindings: {
            // Mock API RPC binding for testing
          },
        },
      },
    },
  },
});
