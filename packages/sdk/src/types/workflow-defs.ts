export interface WorkflowDef {
  id: string;
  owner: string;
  name: string;
  description: string;
  version: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowDefRequest {
  owner: string;
  name: string;
  description?: string;
  nodes: Array<{
    local_id: string;
    action_id: string;
    produces: unknown;
    on_early_complete?: 'cancel' | 'continue';
  }>;
  transitions: Array<{
    from_node: string;
    to_node: string;
    condition?: unknown;
  }>;
}
