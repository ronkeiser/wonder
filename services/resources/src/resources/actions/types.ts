/** Type definitions for actions */

export type ActionKind =
  | 'llm_call'
  | 'mcp_tool'
  | 'http_request'
  | 'human_input'
  | 'update_context'
  | 'write_artifact'
  | 'workflow_call'
  | 'vector_search'
  | 'emit_metric'
  | 'mock';

export type Action = {
  id: string;
  name: string;
  description: string;
  version: number;
  kind: ActionKind;
  implementation: object;
  requires: object | null;
  produces: object | null;
  execution: object | null;
  idempotency: object | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionInput = {
  version?: number;
  name: string;
  description?: string;
  kind: ActionKind;
  implementation: object;
  requires?: object;
  produces?: object;
  execution?: object;
  idempotency?: object;
  autoversion?: boolean;
};
