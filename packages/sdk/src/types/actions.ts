export interface Action {
  id: string;
  name: string;
  action_kind: 'llm_call' | 'mcp_tool' | 'http_request' | 'js_function' | 'subworkflow';
  config: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreateActionRequest {
  name: string;
  action_kind: 'llm_call' | 'mcp_tool' | 'http_request' | 'js_function' | 'subworkflow';
  config: unknown;
}
