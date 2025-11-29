declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
    TEST_SEED_SQL: string;
  }
}

// Vite glob import types
interface ImportMeta {
  glob: <T = unknown>(
    pattern: string,
    options?: {
      query?: string;
      eager?: boolean;
      import?: string;
    },
  ) => Record<string, T>;
}
