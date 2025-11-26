import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: false,
    silent: true,
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.jsonc' },
      },
    },
  },
});
