export interface Workflow {
  id: string;
  project_id: string;
  workflow_def_id: string;
  workflow_def_version: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowRequest {
  project_id: string;
  workflow_def_id: string;
  workflow_def_version?: number;
  name: string;
  description?: string;
}

export interface WorkflowInput {
  workflow_id: string;
  input: Record<string, unknown>;
}

export interface WorkflowEvent {
  kind:
    | 'workflow_started'
    | 'workflow_completed'
    | 'workflow_failed'
    | 'node_started'
    | 'node_completed'
    | 'node_failed'
    | 'token_spawned'
    | 'token_merged'
    | 'token_cancelled'
    | 'subworkflow_started'
    | 'subworkflow_completed'
    | 'artifact_created'
    | 'context_updated';
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowStartResponse {
  workflow_run_id: string;
  durable_object_id: string;
}
