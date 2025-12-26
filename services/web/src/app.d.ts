// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      authenticated?: boolean;
      workspaceId?: string;
    }
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env?: {
        HTTP?: Fetcher;
        ASSETS?: unknown;
        HTTP_URL?: string;
        API_KEY?: string;
        AUTH_USERNAME?: string;
        AUTH_PASSWORD?: string;
        SESSION_SECRET?: string;
      };
    }
  }
}

export {};
