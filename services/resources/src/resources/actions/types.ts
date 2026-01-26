export type ActionKind =
  | 'llm'
  | 'mcp'
  | 'http'
  | 'human'
  | 'context'
  | 'artifact'
  | 'vector'
  | 'metric'
  | 'mock';

/** Action entity — matches database schema columns. */
export type Action = {
  id: string;
  version: number;
  reference: string;
  name: string;
  description: string;
  contentHash: string;
  kind: ActionKind;
  implementation: object;
  requires: object | null;
  produces: object | null;
  execution: object | null;
  idempotency: object | null;
  createdAt: string;
  updatedAt: string;
};

/** API input for creating an action. */
export type ActionInput = {
  name: string;
  description?: string;
  reference?: string;
  kind: ActionKind;
  implementation: Record<string, unknown>;
  requires?: Record<string, unknown> | null;
  produces?: Record<string, unknown> | null;
  execution?: Record<string, unknown> | null;
  idempotency?: Record<string, unknown> | null;
  autoversion?: boolean;
  force?: boolean;
};
