import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30s for e2e tests that hit live APIs
    // include: ['./src/tests/edge.test.ts'],
  },
  envDir: '.',
  envPrefix: ['API_'],
});
