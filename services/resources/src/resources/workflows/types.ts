/** Type definitions for workflows */

export type Workflow = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  workflow_def_id: string;
  pinned_version: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkflowRun = {
  id: string;
  project_id: string;
  workflow_id: string;
  workflow_def_id: string;
  workflow_version: number;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  context: object;
  active_tokens: object;
  latest_snapshot: object | null;
  durable_object_id: string;
  parent_run_id: string | null;
  parent_node_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
