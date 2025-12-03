/** Type definitions for actions */

export type Action = {
  id: string;
  name: string;
  description: string;
  version: number;
  kind:
    | 'llm_call'
    | 'mcp_tool'
    | 'http_request'
    | 'human_input'
    | 'update_context'
    | 'write_artifact'
    | 'workflow_call'
    | 'vector_search'
    | 'emit_metric';
  implementation: object;
  requires: object | null;
  produces: object | null;
  execution: object | null;
  idempotency: object | null;
  created_at: string;
  updated_at: string;
};
