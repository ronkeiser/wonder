declare module 'cloudflare:test' {
  // ProvidedEnv controls the type of `import("cloudflare:test").env`
  interface ProvidedEnv extends Env {}
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
