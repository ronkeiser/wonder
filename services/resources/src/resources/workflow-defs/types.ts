/** Type definitions for workflow definitions */

// Database entity types
export type WorkflowDef = {
  id: string;
  name: string;
  description: string;
  version: number;
  project_id: string | null;
  library_id: string | null;
  tags: string[] | null;
  input_schema: object;
  output_schema: object;
  context_schema: object | null;
  initial_node_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Node = {
  id: string;
  ref: string;
  workflow_def_id: string;
  workflow_def_version: number;
  name: string;
  action_id: string;
  action_version: number;
  input_mapping: object | null;
  output_mapping: object | null;
  fan_out: 'first_match' | 'all';
  fan_in: string; // 'any' | 'all' | 'm_of_n:N'
  joins_node: string | null;
  merge: object | null;
  on_early_complete: 'cancel' | 'abandon' | 'allow_late_merge' | null;
};

export type Transition = {
  id: string;
  ref: string | null;
  workflow_def_id: string;
  workflow_def_version: number;
  from_node_id: string;
  to_node_id: string;
  priority: number;
  condition: object | null;
  foreach: object | null;
  loop_config: object | null;
};
