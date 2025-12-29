import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/schema/migrations',
  schema: './src/schema/index.ts',
  dialect: 'sqlite',
  casing: 'snake_case',
});
