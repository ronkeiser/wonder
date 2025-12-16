import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/schema/migrations',
  dialect: 'sqlite',
});
