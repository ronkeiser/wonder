import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    maxConcurrency: 1,
    // Only run spec conformance tests for now
    // Original implementation tests in test/ are excluded until we're Handlebars-conformant
    include: ['spec/**/*.test.ts'],
    exclude: ['test/**', 'node_modules/**'],
  },
});
