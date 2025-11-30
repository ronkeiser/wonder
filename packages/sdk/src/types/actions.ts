import type { Action as DbAction, NewAction } from '@wonder/api/types';

// Re-export canonical types from API
export type Action = DbAction;

// Request type for creating actions (subset of NewAction)
export interface CreateActionRequest {
  name: string;
  description?: string;
  kind: NewAction['kind'];
  implementation: unknown;
  requires?: unknown;
  produces?: unknown;
  execution?: unknown;
  idempotency?: unknown;
}
