/** Type definitions for workflow definitions */

// Database entity types
export type WorkflowDef = {
  id: string;
  name: string;
  description: string;
  version: number;
  owner_type: 'project' | 'library';
  owner_id: string;
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
  // No branching logic - nodes only execute actions
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
  spawn_count: number | null;
  foreach: object | null;
  synchronization: object | null;
  loop_config: object | null;
};
