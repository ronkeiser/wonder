import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30s for e2e tests that hit live APIs
    include: ['src/tests/**/*.test.ts'],
    exclude: ['src/tests/archive/**'],
  },
  envDir: __dirname,
  envPrefix: ['API_'],
});
